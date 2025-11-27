import { Controller } from '@nestjs/common';
import { BamboohrService } from './bamboohr.service';

@Controller('bamboohr')
export class BamboohrController {
  constructor(private readonly bamboohrService: BamboohrService) {}
}
