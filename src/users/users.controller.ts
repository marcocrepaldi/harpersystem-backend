import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { UsersService } from './users.service';
import { ListUsersDto } from './dto/list-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@Req() req: any) {
    const { userId } = req.user;
    return this.usersService.findOne(userId);
  }

  @Roles('ADMIN')
  @Get()
  async findAll(@Req() req: any, @Query() q: ListUsersDto) {
    const { corretorId } = req.user;
    return this.usersService.findAll({
      corretorId,
      page: q.page,
      limit: q.limit,
      search: q.search,
    });
  }

  @Roles('ADMIN')
  @Post()
  async create(@Req() req: any, @Body() body: CreateUserDto) {
    const { corretorId } = req.user;
    return this.usersService.create({ ...body, corretorId });
  }

  @Roles('ADMIN')
  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const { corretorId } = req.user;
    return this.usersService.findOneScoped({ id, corretorId });
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateUserDto) {
    const { corretorId } = req.user;
    return this.usersService.updateScoped({ id, corretorId }, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const { corretorId } = req.user;
    return this.usersService.removeScoped({ id, corretorId });
  }
}
