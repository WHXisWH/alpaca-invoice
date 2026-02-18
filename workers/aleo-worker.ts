import { ProgramManager, PrivateKey, Account } from '@provablehq/sdk';

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

let pmCache: ProgramManager | null = null;
let cachedBaseUrl: string | null = null;

async function getProgramManager(baseUrl: string): Promise<ProgramManager> {
  if (!pmCache || cachedBaseUrl !== baseUrl) {
    pmCache = new ProgramManager(baseUrl);
    const tempKey = new PrivateKey();
    pmCache.setAccount(new Account({ privateKey: tempKey.to_string() }));
    cachedBaseUrl = baseUrl;
  }
  return pmCache;
}

self.onmessage = async (event: MessageEvent<RunRequest>) => {
  const { id, type, payload } = event.data || {};
  if (type !== 'run' || !payload) return;

  const response: RunResponse = { id };
  try {
    const pm = await getProgramManager(payload.baseUrl);
    const res = await pm.run(payload.program, payload.functionName, payload.inputs, false);
    const outputs = (res as any)?.getOutputs ? (res as any).getOutputs() : (res as any)?.outputs;
    response.result = outputs ?? [];
  } catch (e: any) {
    response.error = e?.message || 'Worker execution failed';
  }
  self.postMessage(response);
};
