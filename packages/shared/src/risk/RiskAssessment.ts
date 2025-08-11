export interface CallMetrics {
  phoneNumber: string;
  timestamp: number;
  asn?: string; // Autonomous System Number
  stirShaken?: 'A' | 'B' | 'C' | null; // STIR/SHAKEN attestation level
  duration?: number;
}

export interface RiskScore {
  overall: number; // 0-100
  factors: {
    burst: number; // Rapid call frequency score
    asn: number; // ASN reputation score
    pacing: number; // Call rhythm/pattern score
    attestation: number; // STIR/SHAKEN score
  };
  recommendation: 'allow' | 'challenge' | 'block';
  skipCallLog?: boolean;
  skipNotification?: boolean;
}

export class RiskAssessment {
  private static readonly BURST_WINDOW_MS = 60 * 1000; // 1 minute
  private static readonly BURST_THRESHOLD = 3; // 3 calls in 1 minute
  private static readonly PACING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  
  // Known problematic ASNs (example list)
  private static readonly RISKY_ASNS = new Set([
    'AS13335', // Example: Known VoIP provider with high spam
    'AS16509', // Example: Cloud provider often used for robocalls
  ]);

  private callHistory: Map<string, CallMetrics[]> = new Map();
  private shadowMode: boolean = true; // Start in shadow mode
  
  constructor(private featureFlags: { enableRiskScoring?: boolean } = {}) {}

  assessCall(metrics: CallMetrics): RiskScore {
    if (!this.featureFlags.enableRiskScoring) {
      return this.getDefaultScore();
    }

    const phoneHistory = this.getPhoneHistory(metrics.phoneNumber);
    phoneHistory.push(metrics);
    
    // Calculate individual risk factors
    const burstScore = this.calculateBurstScore(phoneHistory);
    const asnScore = this.calculateASNScore(metrics.asn);
    const pacingScore = this.calculatePacingScore(phoneHistory);
    const attestationScore = this.calculateAttestationScore(metrics.stirShaken);
    
    // Weighted average for overall score
    const overall = Math.round(
      burstScore * 0.3 +
      asnScore * 0.2 +
      pacingScore * 0.3 +
      attestationScore * 0.2
    );
    
    const score: RiskScore = {
      overall,
      factors: {
        burst: burstScore,
        asn: asnScore,
        pacing: pacingScore,
        attestation: attestationScore
      },
      recommendation: this.getRecommendation(overall),
      skipCallLog: overall > 80 && !this.shadowMode,
      skipNotification: overall > 90 && !this.shadowMode
    };
    
    // Log shadow metrics
    if (this.shadowMode) {
      this.logShadowMetrics(metrics, score);
    }
    
    return score;
  }
  
  private getPhoneHistory(phoneNumber: string): CallMetrics[] {
    if (!this.callHistory.has(phoneNumber)) {
      this.callHistory.set(phoneNumber, []);
    }
    return this.callHistory.get(phoneNumber)!;
  }
  
  private calculateBurstScore(history: CallMetrics[]): number {
    const now = Date.now();
    const recentCalls = history.filter(
      call => now - call.timestamp < RiskAssessment.BURST_WINDOW_MS
    );
    
    if (recentCalls.length >= RiskAssessment.BURST_THRESHOLD) {
      return Math.min(100, recentCalls.length * 20);
    }
    
    return 0;
  }
  
  private calculateASNScore(asn?: string): number {
    if (!asn) return 50; // Unknown ASN = medium risk
    
    if (RiskAssessment.RISKY_ASNS.has(asn)) {
      return 80;
    }
    
    // Check if it's a known carrier ASN (lower risk)
    if (asn.startsWith('AS7018') || asn.startsWith('AS7922')) {
      return 20; // AT&T, Verizon - trusted carriers
    }
    
    return 40; // Default for unknown ASNs
  }
  
  private calculatePacingScore(history: CallMetrics[]): number {
    if (history.length < 2) return 0;
    
    // Check for robotic pacing (exact intervals)
    const intervals: number[] = [];
    for (let i = 1; i < history.length; i++) {
      intervals.push(history[i].timestamp - history[i-1].timestamp);
    }
    
    // Calculate variance in intervals
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => {
      return sum + Math.pow(interval - avgInterval, 2);
    }, 0) / intervals.length;
    
    // Low variance = robotic = high risk
    if (variance < 1000) { // Less than 1 second variance
      return 80;
    }
    
    return 20;
  }
  
  private calculateAttestationScore(attestation?: 'A' | 'B' | 'C' | null): number {
    switch (attestation) {
      case 'A': return 10; // Full attestation - low risk
      case 'B': return 40; // Partial attestation - medium risk
      case 'C': return 60; // Gateway attestation - higher risk
      case null:
      default: return 70; // No attestation - high risk
    }
  }
  
  private getRecommendation(score: number): 'allow' | 'challenge' | 'block' {
    if (score < 40) return 'allow';
    if (score < 70) return 'challenge';
    return 'block';
  }
  
  private getDefaultScore(): RiskScore {
    return {
      overall: 0,
      factors: {
        burst: 0,
        asn: 0,
        pacing: 0,
        attestation: 0
      },
      recommendation: 'allow',
      skipCallLog: false,
      skipNotification: false
    };
  }
  
  private logShadowMetrics(metrics: CallMetrics, score: RiskScore): void {
    console.log('[SHADOW_RISK]', {
      timestamp: new Date().toISOString(),
      phoneNumber: metrics.phoneNumber.substring(0, 6) + '****', // Privacy
      score: score.overall,
      factors: score.factors,
      recommendation: score.recommendation,
      wouldSkipLog: score.skipCallLog,
      wouldSkipNotification: score.skipNotification
    });
  }
  
  setShadowMode(enabled: boolean): void {
    this.shadowMode = enabled;
  }
  
  clearHistory(): void {
    this.callHistory.clear();
  }
}