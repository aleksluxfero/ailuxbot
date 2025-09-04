import { bot } from '@/app/bot/bot';
import { webhookStream } from 'vercel-grammy';  // Импорт из пакета
import { NextRequest } from 'next/server';

// Конфигурация для Vercel (оставляем edge, но можно переключить на 'nodejs' для Fluid Compute, см. ниже)
export const runtime = 'edge';
export const preferredRegion = 'arn1';

// Создаем обработчик с таймаутом (например, 25 секунд, чтобы не превысить Vercel лимит)
const handleUpdate = webhookStream(bot);

export async function POST(req: NextRequest) {
  try {
    // Передаем запрос в стриминговый обработчик
    return await handleUpdate(req);
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Error processing webhook', { status: 500 });
  }
}