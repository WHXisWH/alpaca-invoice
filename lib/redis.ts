import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export const kvKey = {
  byHash: (hash: string) => `invhash:${hash}`,
  byId:   (id: string)   => `invid:${id}`,
};

/** 2-year TTL in seconds */
export const DETAILS_TTL = 60 * 60 * 24 * 365 * 2;
