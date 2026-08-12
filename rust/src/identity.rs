use serde_json::{Map, Value};

use crate::{Error, Result};

/// Principal established by a workload identity provider.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthenticatedPrincipal {
    pub subject: String,
    pub issuer: String,
    pub evidence_id: Option<String>,
}

/// Verifiable carrier produced for one request by an identity hook.
#[derive(Clone, Debug, PartialEq)]
pub struct WorkloadIdentityEvidence {
    pub carrier_key: String,
    pub carrier: Value,
}

impl WorkloadIdentityEvidence {
    pub fn new(carrier_key: impl Into<String>, carrier: Value) -> Result<Self> {
        let evidence = Self {
            carrier_key: carrier_key.into(),
            carrier,
        };
        if evidence.carrier_key.trim().is_empty()
            || evidence.carrier_key == "by"
            || evidence.carrier.is_null()
        {
            return Err(Error::Incompatible(
                "workload identity evidence needs a non-by carrier key and non-null value".into(),
            ));
        }
        Ok(evidence)
    }
}

impl AuthenticatedPrincipal {
    pub fn new(subject: impl Into<String>, issuer: impl Into<String>) -> Result<Self> {
        let principal = Self {
            subject: subject.into(),
            issuer: issuer.into(),
            evidence_id: None,
        };
        principal.validate()?;
        Ok(principal)
    }

    fn validate(&self) -> Result<()> {
        if self.subject.trim().is_empty() || self.issuer.trim().is_empty() {
            return Err(Error::Incompatible(
                "authenticated principal subject and issuer must be non-empty".into(),
            ));
        }
        Ok(())
    }
}

/// Hook for an external workload identity implementation.
///
/// `evidence` returns a signature, token, nonce, or other carrier for `args`.
/// The receiving daemon or gateway must verify that carrier; the SDK never
/// treats a caller-provided `by` value as authentication.
pub trait WorkloadIdentityHook {
    fn principal(&self) -> Result<AuthenticatedPrincipal>;

    /// Sign or otherwise bind the operation and canonical args to evidence.
    fn evidence(
        &self,
        operation: &str,
        args: &Map<String, Value>,
    ) -> Result<WorkloadIdentityEvidence>;
}

pub(crate) fn bind_identity<H: WorkloadIdentityHook>(
    hook: &H,
    operation: &str,
    args: &mut Map<String, Value>,
) -> Result<AuthenticatedPrincipal> {
    let principal = hook.principal()?;
    principal.validate()?;
    if let Some(claimed) = args.get("by") {
        if claimed.as_str() != Some(&principal.subject) {
            return Err(Error::Incompatible(
                "request by does not match authenticated principal".into(),
            ));
        }
    }
    args.insert("by".into(), Value::String(principal.subject.clone()));
    let evidence = hook.evidence(operation, args)?;
    if args.contains_key(&evidence.carrier_key) {
        return Err(Error::Incompatible(format!(
            "workload identity carrier would overwrite request field {}",
            evidence.carrier_key
        )));
    }
    args.insert(evidence.carrier_key, evidence.carrier);
    Ok(principal)
}
