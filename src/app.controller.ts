import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class AppController {
  @Get('select-location/:orderId')
  serveLocationSelectionPage(
    @Param('orderId') orderId: string,
    @Res() res: Response,
  ) {
    res.sendFile(join(__dirname, '..', 'public', 'select-location.html'));
  }
}
