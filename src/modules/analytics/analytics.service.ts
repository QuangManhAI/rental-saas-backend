import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Bill, BillDocument } from '../bills/bills.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { GetDashboardAnalyticsDto, GroupBy } from './dto/get-dashboard-analytics.dto';
import dayjs from 'dayjs';

@Injectable()
export class AnalyticsService {
    constructor(
        @InjectModel(Bill.name) private billModel: Model<BillDocument>,
        @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
        @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    ) { }

    async getDashboardAnalytics(ownerIdString: string, dto: GetDashboardAnalyticsDto) {
        const { from, to, groupBy, houseId } = dto;
        const ownerId = new Types.ObjectId(ownerIdString);
        const startDate = new Date(from);
        const endDate = new Date(to);

        // 1. Revenue Analytics
        const revenueStats = await this.getRevenueStats(ownerId, startDate, endDate, groupBy, houseId);

        // 2. Business Trend Analytics
        const trendStats = await this.getTrendStats(ownerId, startDate, endDate, groupBy, houseId);

        return {
            revenue: revenueStats,
            trends: trendStats,
        };
    }

    private async getRevenueStats(
        ownerId: Types.ObjectId,
        startDate: Date,
        endDate: Date,
        groupBy: GroupBy,
        houseId?: string,
    ) {
        const matchStage: any = {
            ownerId,
            createdAt: { $gte: startDate, $lte: endDate },
        };

        // If houseId is provided, we need to filter bills by room -> property.
        // However, Bill schema doesn't have propertyId directly, but has roomId.
        // We might need a lookup if we want strict filtering by houseId.
        // Strategy: Fetch roomIds for the house first if houseId is present.
        if (houseId) {
            const rooms = await this.roomModel.find({ propertyId: new Types.ObjectId(houseId) }).select('_id');
            const roomIds = rooms.map(r => r._id);
            matchStage.roomId = { $in: roomIds };
        }

        const dateFormat = this.getDateFormat(groupBy);

        const revenueData = await this.billModel.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
                    totalRevenue: { $sum: '$totalAmount' },
                    collected: { $sum: '$paidAmount' },
                    // Outstanding is calculated in projection or code
                },
            },
            {
                $project: {
                    period: '$_id',
                    totalRevenue: 1,
                    collected: 1,
                    outstanding: { $subtract: ['$totalRevenue', '$collected'] },
                    _id: 0,
                },
            },
            { $sort: { period: 1 } },
        ]);

        // Fill gaps
        return this.fillGaps(revenueData, startDate, endDate, groupBy, { totalRevenue: 0, collected: 0, outstanding: 0 });
    }

    private async getTrendStats(
        ownerId: Types.ObjectId,
        startDate: Date,
        endDate: Date,
        groupBy: GroupBy,
        houseId?: string,
    ) {
        const periods = this.generatePeriods(startDate, endDate, groupBy);
        const result = [];

        // Pre-fetch data to avoid N+1 queries in loop
        // 1. Contracts in range
        const contractQUERY: any = {
            ownerId,
            // Contracts that overlap with the window [startDate, endDate]
            startDate: { $lte: endDate },
            // If contract has no endDate (indefinite), it overlaps. Or assume all fit.
            // Schema says endDate is required.
            endDate: { $gte: startDate },
        }

        // Filter by house
        if (houseId) {
            // Need to filter contracts by room -> property
            const rooms = await this.roomModel.find({ propertyId: new Types.ObjectId(houseId) }).select('_id');
            const roomIds = rooms.map(r => r._id);
            contractQUERY.roomId = { $in: roomIds };
        }

        const contracts = await this.contractModel.find(contractQUERY).lean();

        // 2. Rooms count (Total capacity)
        // If houseId is filtered, get count for that house. Else all houses.
        const roomQuery: any = { ownerId };
        if (houseId) {
            roomQuery.propertyId = new Types.ObjectId(houseId);
        }
        const totalRooms = await this.roomModel.countDocuments(roomQuery);

        for (const period of periods) {
            const pStart = period.start;
            const pEnd = period.end;
            const label = period.label;

            // Active Contracts: Count active at the END of the period (or during).
            // Let's use "Active at any point in period" or "Active at end of period"?
            // User note: "active contracts in that period".
            // Logic: Contract start <= pEnd AND Contract end >= pStart
            const activeContracts = contracts.filter(c =>
                new Date(c.startDate) <= pEnd && new Date(c.endDate) >= pStart
            ).length;

            // New Contracts: Started in this period
            const newContracts = contracts.filter(c =>
                new Date(c.startDate) >= pStart && new Date(c.startDate) <= pEnd
            ).length;

            // Occupied Rooms = Active Contracts (1-1 assumption, usually true for boarding houses)
            const occupiedRooms = activeContracts;
            // Vacant Rooms = Total Rooms - Occupied
            // Note: Total rooms might change over time, but for trends we often assume constant relative to query time or use approximate.
            // Refinement: If a room was created after this period? Mongoose doesn't track creation time unless we look at _id.
            // For MVP: Use current total rooms.
            const vacantRooms = Math.max(0, totalRooms - occupiedRooms);

            result.push({
                period: label,
                activeContracts,
                newContracts,
                occupiedRooms,
                vacantRooms
            });
        }

        return result;
    }

    // --- Helpers ---

    private getDateFormat(groupBy: GroupBy): string {
        switch (groupBy) {
            case GroupBy.DAY: return '%Y-%m-%d';
            case GroupBy.WEEK: return '%Y-%U'; // Year-Week
            case GroupBy.MONTH: return '%Y-%m';
            case GroupBy.YEAR: return '%Y';
            default: return '%Y-%m-%d';
        }
    }

    private generatePeriods(start: Date, end: Date, groupBy: GroupBy) {
        const periods = [];
        let current = dayjs(start);
        const endMoment = dayjs(end);

        while (current.isBefore(endMoment) || current.isSame(endMoment, 'day')) {
            let next;
            let label;

            switch (groupBy) {
                case GroupBy.DAY:
                    next = current.endOf('day');
                    label = current.format('YYYY-MM-DD');
                    break;
                case GroupBy.WEEK:
                    next = current.endOf('week');
                    label = current.format('YYYY-WW'); // format might need adjustment for week
                    break;
                case GroupBy.MONTH:
                    next = current.endOf('month');
                    label = current.format('YYYY-MM');
                    break;
                case GroupBy.YEAR:
                    next = current.endOf('year');
                    label = current.format('YYYY');
                    break;
            }

            periods.push({
                start: current.toDate(),
                end: next.toDate(),
                label: label
            });

            current = next.add(1, 'second'); // Start of next period
            if (groupBy === GroupBy.DAY) current = current.startOf('day');
            if (groupBy === GroupBy.WEEK) current = current.startOf('week');
            if (groupBy === GroupBy.MONTH) current = current.startOf('month');
            if (groupBy === GroupBy.YEAR) current = current.startOf('year');
        }
        return periods;
    }

    private fillGaps(data: any[], start: Date, end: Date, groupBy: GroupBy, defaultVal: any) {
        const periods = this.generatePeriods(start, end, groupBy);
        // Create map for easy lookup
        const dataMap = new Map();
        data.forEach(item => dataMap.set(item.period, item));

        return periods.map(p => {
            const found = dataMap.get(p.label);
            return found ? found : { period: p.label, ...defaultVal };
        });
    }
}
