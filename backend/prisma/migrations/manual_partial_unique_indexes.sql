-- Partial unique indexes cho các trường duy nhất-khi-chưa-xóa-mềm.
-- Prisma không khai báo được partial unique index nên chạy tay file này
-- SAU khi migrate schema chính:
--   psql "$DATABASE_URL" -f prisma/migrations/manual_partial_unique_indexes.sql
-- Nhờ đó một bản ghi đã xóa mềm (isDelete = true) không còn chiếm giữ giá
-- trị, và có thể tạo lại bản ghi mới cùng mã / cùng CCCD.

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_code_active
  ON person ("personCode") WHERE "isDelete" = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_idno_active
  ON person ("idNo") WHERE "isDelete" = false AND "idNo" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_tax_active
  ON person ("personalTaxCode") WHERE "isDelete" = false AND "personalTaxCode" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_socialins_active
  ON person ("socialInsNo") WHERE "isDelete" = false AND "socialInsNo" IS NOT NULL;
