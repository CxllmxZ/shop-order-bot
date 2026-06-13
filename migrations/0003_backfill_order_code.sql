-- Backfill 3 records เดิม (ใช้เลขสุ่ม ที่ไม่ซ้ำกัน)
UPDATE orders SET order_code = '100001' WHERE id = 1;
UPDATE orders SET order_code = '100002' WHERE id = 2;
UPDATE orders SET order_code = '100003' WHERE id = 3;