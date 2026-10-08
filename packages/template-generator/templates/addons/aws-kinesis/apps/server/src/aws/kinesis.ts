import { KinesisClient, PutRecordCommand } from "@aws-sdk/client-kinesis";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const client = new KinesisClient({});
const encoder = new TextEncoder();

export function putRecord(partitionKey: string, data: JsonValue) {
  return client.send(
    new PutRecordCommand({
      StreamName: process.env.KINESIS_STREAM_NAME!,
      PartitionKey: partitionKey,
      Data: encoder.encode(JSON.stringify(data)),
    }),
  );
}
