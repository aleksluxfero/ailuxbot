import { bot } from '@/app/bot/bot';
import { webhookCallback } from 'grammy';
import { NextRequest } from 'next/server';

// Конфигурация для Vercel для запуска в Edge-среде
export const runtime = 'edge';
export const preferredRegion = 'arn1';

// Создаем обработчик, используя 'std/http' для совместимости с Edge
const handleUpdate = webhookCallback(bot, 'std/http');

export async function POST(req: NextRequest) {
  try {
    // Передаем запрос в обработчик grammY
    return await handleUpdate(req);
  } catch (error) {
    console.error('Webhook error:', error);
    // В случае непредвиденной ошибки возвращаем статус 500
    return new Response('Error processing webhook', { status: 500 });
  }
}