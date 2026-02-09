import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpsertPaymentSettingsDto {
    @IsOptional()
    @IsIn(['MOMO', 'VNPAY'])
    provider?: string;

    @IsOptional()
    @IsString()
    momoPartnerCode?: string;

    @IsOptional()
    @IsString()
    momoAccessKey?: string;

    @IsOptional()
    @IsString()
    momoSecretKey?: string;

    @IsOptional()
    @IsString()
    vnpayTmnCode?: string;

    @IsOptional()
    @IsString()
    vnpayHashSecret?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
