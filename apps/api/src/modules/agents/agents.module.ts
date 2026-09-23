import { Module } from "@nestjs/common";
import { AgentExpiryService } from "./agent-expiry.service";
import { AgentsController } from "./agents.controller";
import { AgentsRepository } from "./agents.repository";
import { AgentsService } from "./agents.service";

@Module({
  controllers: [AgentsController],
  providers: [AgentsService, AgentsRepository, AgentExpiryService],
})
export class AgentsModule {}
