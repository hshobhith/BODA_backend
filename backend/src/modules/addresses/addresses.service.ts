import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private readonly addressesRepository: Repository<Address>,
  ) {}

  async findAllForUser(userId: string): Promise<Address[]> {
    return this.addressesRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  private async findOwned(id: string, userId: string): Promise<Address> {
    const address = await this.addressesRepository.findOne({ where: { id } });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    if (address.userId !== userId) {
      throw new ForbiddenException('You do not have access to this address');
    }
    return address;
  }

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    if (dto.isDefault) {
      await this.addressesRepository.update({ userId }, { isDefault: false });
    }

    const address = this.addressesRepository.create({ ...dto, userId });
    return this.addressesRepository.save(address);
  }

  async update(id: string, userId: string, dto: UpdateAddressDto): Promise<Address> {
    const address = await this.findOwned(id, userId);

    if (dto.isDefault) {
      await this.addressesRepository.update({ userId }, { isDefault: false });
    }

    Object.assign(address, dto);
    return this.addressesRepository.save(address);
  }

  async remove(id: string, userId: string): Promise<void> {
    const address = await this.findOwned(id, userId);
    // Soft delete: past orders that were delivered here still show the address.
    await this.addressesRepository.softRemove(address);
  }

  async setDefault(id: string, userId: string): Promise<Address> {
    await this.findOwned(id, userId);
    await this.addressesRepository.update({ userId }, { isDefault: false });
    await this.addressesRepository.update({ id }, { isDefault: true });
    return this.findOwned(id, userId);
  }
}
