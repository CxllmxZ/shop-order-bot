-- เพิ่ม column order_code
ALTER TABLE orders ADD COLUMN order_code TEXT;

-- สร้าง index เพื่อ search/check duplicate ได้เร็ว
CREATE UNIQUE INDEX idx_orders_order_code ON orders(order_code);