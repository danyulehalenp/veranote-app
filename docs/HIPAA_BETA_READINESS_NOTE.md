# HIPAA Beta Readiness Note

This document is a product and operations checkpoint, not a claim that Veranote is already HIPAA compliant.

## Current honest status

Veranote is moving from an internal prototype toward controlled beta access. That means HIPAA has to be addressed as a full system question:

- contracts
- hosting
- access control
- auditability
- encryption
- retention
- incident response
- vendor management

The app code alone is not enough.

## Minimum gates before real PHI beta use

1. Business associate coverage
- Signed BAAs with every covered entity customer
- Signed BAAs or equivalent HIPAA-ready contractual coverage with every vendor that creates, receives, maintains, or transmits ePHI on Veranote's behalf

2. Environment isolation
- Separate production/beta environments from local/dev
- No prototype internal mode in production
- No seeded demo access patterns exposed to external beta users

3. Access control
- Real provider auth
- Unique accounts per provider
- Session management
- Least-privilege access to provider data

4. Technical safeguards
- Encryption in transit
- Encryption at rest
- Audit logging for access and important changes
- Backup and recovery controls
- Device/session revocation approach

5. Administrative safeguards
- Security risk analysis
- Written policies and procedures
- Workforce access/offboarding process
- Incident response and breach workflow
- Retention and destruction rules

6. Product safeguards
- De-identified data only until the environment is approved for PHI
- Explicit source-fidelity boundaries
- No silent sharing across provider accounts
- No prototype provider switching in production

## Code-side guards now in place

- real beta sign-in flow
- session-scoped provider access
- safer callback redirect handling
- reduced provider roster exposure in external beta mode
- production runtime guard against:
  - missing auth secret
  - missing beta access-code config
  - internal mode being left on

## Still required outside code

- final hosting/vendor review
- BAA review and execution
- logging/monitoring review
- backup and disaster recovery review
- documented security risk assessment
- privacy/security policy package

## Product posture recommendation

Until those operational pieces are complete, keep Veranote in one of these states:

- de-identified data only
- or controlled internal testing

Do not market or position the app as production HIPAA-ready until the legal, operational, and technical layers are all closed together.

