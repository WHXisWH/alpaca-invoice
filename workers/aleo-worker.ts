import { BHP256, Address, U64, U32, Field } from '@provablehq/sdk';

type RunRequest = {
  id: string;
  type: 'run';
  payload: {
    program: string;
    functionName: string;
    inputs: any[];
    baseUrl: string;
  };
};

type RunResponse = {
  id: string;
  result?: string[];
  error?: string;
};

function addFieldSuffix(value: string): string {
  return value.endsWith('field') ? value : `${value}field`;
}

function computeInvoiceHash(inputs: string[]): string {
  const bits = [
    ...Address.from_string(inputs[0]).toBitsLe(),
    ...Address.from_string(inputs[1]).toBitsLe(),
    ...U64.fromString(inputs[2]).toBitsLe(),
    ...U64.fromString(inputs[3]).toBitsLe(),
    ...U32.fromString(inputs[4]).toBitsLe(),
    ...Field.fromString(inputs[5]).toBitsLe(),
    ...Field.fromString(inputs[6]).toBitsLe(),
    ...Field.fromString(inputs[7]).toBitsLe(),
    ...Field.fromString(inputs[8]).toBitsLe(),
    ...Field.fromString(inputs[9]).toBitsLe(),
  ];
  const hash = new BHP256().hash(bits).toString();
  return addFieldSuffix(hash);
}

function computeInvoiceId(inputs: string[]): string {
  const bits = [
    ...Address.from_string(inputs[0]).toBitsLe(),
    ...Address.from_string(inputs[1]).toBitsLe(),
    ...U64.fromString(inputs[2]).toBitsLe(),
    ...U32.fromString(inputs[3]).toBitsLe(),
    ...Field.fromString(inputs[4]).toBitsLe(),
  ];
  const hash = new BHP256().hash(bits).toString();
  return addFieldSuffix(hash);
}

self.onmessage = async (event: MessageEvent<RunRequest>) => {
  const { id, type, payload } = event.data || {};
  if (type !== 'run' || !payload) return;

  const response: RunResponse = { id };
  try {
    if (payload.functionName === 'compute_invoice_hash') {
      const bhp = computeInvoiceHash(payload.inputs as string[]);
      response.result = [bhp];
    } else if (payload.functionName === 'compute_invoice_id') {
      const bhp = computeInvoiceId(payload.inputs as string[]);
      response.result = [bhp];
    } else {
      response.error = 'Unsupported functionName';
    }
  } catch (e: any) {
    response.error = e?.message || 'Worker execution failed';
  }
  self.postMessage(response);
};
