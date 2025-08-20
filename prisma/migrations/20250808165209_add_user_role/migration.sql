-- CreateEnum
CREATE TYPE "harper_app_dev"."Role" AS ENUM ('ADMIN', 'USER');

-- AlterTable
ALTER TABLE "harper_app_dev"."User" ADD COLUMN     "role" "harper_app_dev"."Role" NOT NULL DEFAULT 'USER';
