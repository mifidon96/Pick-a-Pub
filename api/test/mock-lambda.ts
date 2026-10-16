// Test double for @aws-sdk/client-lambda: admin calls run the real admin code
// against the local database; async self-invokes are recorded.
import { runAdmin } from "../src/admin";
export const asyncCalls: unknown[] = [];
export class InvokeCommand { constructor(public input: { FunctionName?: string; InvocationType?: string; Payload?: Uint8Array }) {} }
export class LambdaClient {
  async send(cmd: InvokeCommand) {
    const payload = JSON.parse(new TextDecoder().decode(cmd.input.Payload));
    if (cmd.input.InvocationType === "Event") { asyncCalls.push(payload); return {}; }
    try {
      const out = await runAdmin(payload);
      return { Payload: new TextEncoder().encode(JSON.stringify(out)) };
    } catch (e) {
      return { FunctionError: "Unhandled", Payload: new TextEncoder().encode(JSON.stringify({ errorMessage: (e as Error).message })) };
    }
  }
}
