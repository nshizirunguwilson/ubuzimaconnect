-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "audioMs" INTEGER;

-- CreateTable
CREATE TABLE "ChatAudio" (
    "messageId" UUID NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "ChatAudio_pkey" PRIMARY KEY ("messageId")
);

-- AddForeignKey
ALTER TABLE "ChatAudio" ADD CONSTRAINT "ChatAudio_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
