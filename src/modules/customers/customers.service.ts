import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument } from './customer.schema';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
  ) {}

  async create(createCustomerDto: CreateCustomerDto, ownerId: string) {
    const customer = new this.customerModel({
      ...createCustomerDto,
      ownerId,
    });
    return customer.save();
  }

  async findAll(ownerId: string) {
    return this.customerModel.find({ ownerId }).sort({ createdAt: -1 });
  }

  async findOne(id: string, ownerId: string) {
    return this.customerModel.findOne({ _id: id, ownerId });
  }

  async update(id: string, updateCustomerDto: UpdateCustomerDto, ownerId: string) {
    return this.customerModel.findOneAndUpdate(
      { _id: id, ownerId },
      updateCustomerDto,
      { new: true },
    );
  }

  async remove(id: string, ownerId: string) {
    return this.customerModel.findOneAndDelete({ _id: id, ownerId });
  }
}