'use client';

import { generateAuditKey } from '@/lib/crypto';
import { saveAuditKey, listAuditKeys } from '@/lib/storage';
import type { AuditKey, AuditKeyConfig } from '@/lib/types';

export const auditService = {
  async generate(config: AuditKeyConfig, viewKey: string): Promise<AuditKey> {
    const key = await generateAuditKey(config, viewKey);
    await saveAuditKey(key);
    return key;
  },
  async list(): Promise<AuditKey[]> {
    return listAuditKeys();
  }
};
