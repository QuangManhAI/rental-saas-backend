import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum GroupBy {
    DAY = 'day',
    WEEK = 'week',
    MONTH = 'month',
    YEAR = 'year',
}

export class GetDashboardAnalyticsDto {
    @IsOptional()
    @IsString()
    houseId?: string;

    @IsDateString()
    from: string;

    @IsDateString()
    to: string;

    @IsEnum(GroupBy)
    groupBy: GroupBy;
}
