import { GetScheduleCommand, SchedulerClient } from "@aws-sdk/client-scheduler";

const client = new SchedulerClient({});

export function getSchedule() {
  return client.send(
    new GetScheduleCommand({
      Name: process.env.SCHEDULER_SCHEDULE_NAME!,
    }),
  );
}
