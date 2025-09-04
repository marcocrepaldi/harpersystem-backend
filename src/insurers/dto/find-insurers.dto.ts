import { Transform } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';


export class FindInsurersQueryDto {
@IsOptional()
@IsString()
q?: string;


@IsOptional()
@IsString()
line?: string; // HEALTH, DENTAL, LIFE, P_AND_C, OTHER


@IsOptional()
@IsBooleanString()
isActive?: string; // "true" | "false"


@IsOptional()
@Transform(({ value }) => parseInt(value, 10))
@IsInt()
@Min(1)
page?: number = 1;


@IsOptional()
@Transform(({ value }) => parseInt(value, 10))
@IsInt()
@Min(1)
@Max(100)
limit?: number = 10;


@IsOptional()
@IsIn(['tradeName', 'createdAt'])
sortBy?: 'tradeName' | 'createdAt' = 'tradeName';


@IsOptional()
@IsIn(['asc', 'desc'])
sortOrder?: 'asc' | 'desc' = 'asc';
}