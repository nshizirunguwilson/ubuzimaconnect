import { Controller, Get, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { CodeService } from "./auth/code.service";
import { AuthGuard } from "./auth/guard";
import { LangController, MeController } from "./auth/me.controller";
import { NidaClient } from "./auth/nida.client";
import { PatientAuthController } from "./auth/patient-auth.controller";
import { SessionService } from "./auth/session.service";
import { StaffAuthController } from "./auth/staff-auth.controller";
import { ThrottleService } from "./auth/throttle.service";
import { AuditService } from "./common/audit.service";
import { DbService } from "./common/db.service";
import { ErrorFilter } from "./common/errors";
import { MailService } from "./common/mail.service";
import { DevController } from "./dev/dev.controller";
import { PhotoController } from "./patients/photo.controller";
import { AgentController } from "./agent/agent.controller";
import { ClinicianController } from "./clinician/clinician.controller";
import { PrescriptionCheckController, PrescriptionsController } from "./prescriptions/prescriptions.controller";
import { PrescriptionsService } from "./prescriptions/prescriptions.service";
import { RecordsController } from "./records/records.controller";
import { ReportsController } from "./records/reports.controller";
import { ReportsService } from "./records/reports.service";
import { AlertsController } from "./timers/alerts.controller";
import { AlertsService } from "./timers/alerts.service";
import { TimersService } from "./timers/timers.service";
import { PushController } from "./push/push.controller";
import { PushService } from "./push/push.service";
import { OnDutyController, StaffActivityController } from "./records/staff-activity.controller";
import { DispatcherService } from "./agent/dispatcher.service";
import { AiService } from "./cases/ai.service";
import { RoutingService } from "./cases/routing.service";
import { EventsController } from "./live/events.controller";
import { EventsService } from "./live/events.service";
import { CasesController } from "./cases/cases.controller";
import { FacilityDataService } from "./cases/facilities.service";
import { PublicController } from "./cases/public.controller";
import { CliniciansController } from "./setup/clinicians.controller";
import { FacilitiesController } from "./setup/facilities.controller";
import { RedFlagsController } from "./setup/red-flags.controller";
import { MyShiftsController, ScheduleController } from "./setup/schedule.controller";
import { SettingsController } from "./setup/settings.controller";
import { StaffController } from "./staff/staff.controller";

@Controller()
class HealthController {
  @Get("health")
  health() {
    return { ok: true };
  }
}

@Module({
  controllers: [
    HealthController,
    PatientAuthController,
    StaffAuthController,
    MeController,
    LangController,
    StaffController,
    PhotoController,
    FacilitiesController,
    CliniciansController,
    ScheduleController,
    MyShiftsController,
    RedFlagsController,
    SettingsController,
    CasesController,
    PublicController,
    AgentController,
    ClinicianController,
    PrescriptionsController,
    PrescriptionCheckController,
    RecordsController,
    ReportsController,
    StaffActivityController,
    OnDutyController,
    AlertsController,
    PushController,
    EventsController,
    DevController,
  ],
  providers: [
    DbService,
    AuditService,
    MailService,
    NidaClient,
    SessionService,
    ThrottleService,
    CodeService,
    AiService,
    FacilityDataService,
    EventsService,
    RoutingService,
    DispatcherService,
    PrescriptionsService,
    AlertsService,
    TimersService,
    PushService,
    ReportsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
