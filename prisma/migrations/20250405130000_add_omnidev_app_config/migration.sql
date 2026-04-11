-- CreateTable
CREATE TABLE "omnidev_app_config" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "omnidev_app_config_pkey" PRIMARY KEY ("id")
);
