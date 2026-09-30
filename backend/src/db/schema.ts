import { pgTable, serial, varchar, timestamp, integer, text, index, customType } from 'drizzle-orm/pg-core';

const geometryPoint = customType<{ data: { lng: number; lat: number }; driverData: string }>({
  dataType() {
    return 'geometry(Point, 4326)';
  },
  toDriver(value) {
    return `SRID=4326;POINT(${value.lng} ${value.lat})`;
  },
  fromDriver(value: string) {
    const match = value.match(/POINT\(([^ ]+) ([^)]+)\)/i);
    if (match) {
      return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
    }
    if (/^[0-9a-fA-F]+$/.test(value)) {
      const buf = Buffer.from(value, 'hex');
      if (buf.length >= 25) {
        const isLittleEndian = buf[0] === 1;
        return {
          lng: isLittleEndian ? buf.readDoubleLE(9) : buf.readDoubleBE(9),
          lat: isLittleEndian ? buf.readDoubleLE(17) : buf.readDoubleBE(17),
        };
      }
    }
    return value as any;
  },
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  deviceId: varchar('device_id', { length: 255 }).notNull().unique(),
  nickname: varchar('nickname', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastActive: timestamp('last_active', { withTimezone: true }).defaultNow(),
});

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  category: varchar('category', { length: 50 }).notNull(),
  severity: integer('severity').notNull(),
  description: text('description'),
  location: geometryPoint('location').notNull(),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => {
  return [
    index('reports_location_idx').using('gist', table.location),
    index('reports_category_idx').on(table.category),
    index('reports_status_idx').on(table.status),
  ];
});
