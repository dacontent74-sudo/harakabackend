import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix for API routes ONLY (not root routes like /select-location)
  app.setGlobalPrefix('api/v1', {
    exclude: ['select-location/:orderId'],
  });

  // CORS - allow all origins for location selection page
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0'); // Listen on all network interfaces

  console.log('');
  console.log('🚀 Haraka Backend API Started!');
  console.log(`📡 Server: http://localhost:${port}`);
  console.log(`📋 API: http://localhost:${port}/api/v1`);
  console.log(`🌐 Network: http://192.168.1.81:${port}/api/v1`);
  console.log('');
}

bootstrap();
