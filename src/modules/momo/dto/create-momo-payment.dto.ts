import { IsMongoId, IsNotEmpty } from 'class-validator';

/**
 * DTO for creating a MoMo payment request
 */
export class CreateMomoPaymentDto {
    @IsMongoId()
    @IsNotEmpty()
    billId: string;
}
