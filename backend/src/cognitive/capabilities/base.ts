export interface CapabilityInput<T> {
  payload: T;
}

export interface CapabilityOutput<T> {
  data: T;
  confidence: number;
  metadata: {
    durationMs: number;
    timestamp: string;
  };
}

export abstract class BaseCapability<TInput, TOutput> {
  abstract getName(): string;
  
  public async execute(
    input: CapabilityInput<TInput>
  ): Promise<CapabilityOutput<TOutput>> {
    const startTime = Date.now();
    try {
      const data = await this.performAnalysis(input.payload);
      const durationMs = Date.now() - startTime;
      const confidence = await this.calculateConfidenceScore(data);
      
      return {
        data,
        confidence,
        metadata: {
          durationMs,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error(`[Capability] [${this.getName()}] Execution failed:`, error);
      throw error;
    }
  }

  protected abstract performAnalysis(payload: TInput): Promise<TOutput>;
  
  protected async calculateConfidenceScore(output: TOutput): Promise<number> {
    // Default fallback confidence
    return 90;
  }
}
