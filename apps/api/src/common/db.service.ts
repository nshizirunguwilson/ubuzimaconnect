import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createDb } from "@ubuzima/db";

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly client = createDb();

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
