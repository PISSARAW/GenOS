use serde_json::{Map, Value};

use crate::types::{PlannedCommand, ProtocolError};

pub struct CommandPlanner<'a> {
    pub operation: &'a str,
    pub object: &'a Map<String, Value>,
    pub args: Vec<String>,
}

impl<'a> CommandPlanner<'a> {
    pub fn new(operation: &'a str, object: &'a Map<String, Value>) -> Self {
        Self {
            operation,
            object,
            args: vec!["agent".to_string(), operation.to_string()],
        }
    }

    pub fn invalid(&self, message: &str) -> ProtocolError {
        ProtocolError::InvalidInput {
            operation: self.operation.to_string(),
            message: message.to_string(),
        }
    }

    pub fn req_str(&self, key: &str) -> Result<&'a str, ProtocolError> {
        self.opt_str(key)?
            .ok_or_else(|| self.invalid(&format!("missing required string '{key}'")))
    }

    pub fn opt_str(&self, key: &str) -> Result<Option<&'a str>, ProtocolError> {
        match self.object.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::String(value)) if !value.is_empty() => Ok(Some(value)),
            Some(_) => Err(self.invalid(&format!("'{key}' must be a non-empty string"))),
        }
    }

    pub fn opt_bool(&self, key: &str) -> Result<Option<bool>, ProtocolError> {
        match self.object.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::Bool(value)) => Ok(Some(*value)),
            Some(_) => Err(self.invalid(&format!("'{key}' must be a boolean"))),
        }
    }

    pub fn req_bool(&self, key: &str) -> Result<bool, ProtocolError> {
        self.opt_bool(key)?
            .ok_or_else(|| self.invalid(&format!("missing required boolean '{key}'")))
    }

    pub fn push_flag(&mut self, flag: &str, value: &str) {
        self.args.push(flag.to_string());
        self.args.push(value.to_string());
    }

    pub fn push_root(&mut self, flag: &str) -> Result<(), ProtocolError> {
        let root = self.opt_str("root")?.unwrap_or(".genos");
        self.push_flag(flag, root);
        Ok(())
    }

    pub fn push_strings(&mut self, key: &str, flag: &str) -> Result<(), ProtocolError> {
        let values = match self.object.get(key) {
            None | Some(Value::Null) => return Ok(()),
            Some(Value::Array(values)) => values,
            _ => {
                return Err(self.invalid(&format!("'{key}' must be an array of non-empty strings")))
            }
        };
        for value in values {
            let value = value.as_str().filter(|v| !v.is_empty()).ok_or_else(|| {
                self.invalid(&format!("'{key}' entries must be non-empty strings"))
            })?;
            self.push_flag(flag, value);
        }
        Ok(())
    }

    pub fn push_req_strings(&mut self, key: &str, flag: &str) -> Result<(), ProtocolError> {
        let values = match self.object.get(key) {
            Some(Value::Array(values)) if !values.is_empty() => values,
            _ => {
                return Err(
                    self.invalid(&format!("'{key}' must be a non-empty array of non-empty strings"))
                )
            }
        };
        for value in values {
            let value = value.as_str().filter(|v| !v.is_empty()).ok_or_else(|| {
                self.invalid(&format!("'{key}' entries must be non-empty strings"))
            })?;
            self.push_flag(flag, value);
        }
        Ok(())
    }

    pub fn push_usize_with_default(
        &mut self,
        key: &str,
        flag_default: (&str, usize),
    ) -> Result<(), ProtocolError> {
        let (flag, default) = flag_default;
        let value = match self.object.get(key) {
            None | Some(Value::Null) => Some(default),
            Some(v) => v.as_u64().map(|v| v as usize),
        };
        let value =
            value.ok_or_else(|| self.invalid(&format!("'{key}' must be a positive integer")))?;
        if value == 0 {
            return Err(self.invalid(&format!("'{key}' must be positive")));
        }
        self.push_flag(flag, &value.to_string());
        Ok(())
    }

    pub fn push_number(&mut self, key: &str, flag: &str) -> Result<(), ProtocolError> {
        let value = self
            .object
            .get(key)
            .and_then(Value::as_f64)
            .ok_or_else(|| self.invalid(&format!("'{key}' must be a number")))?;
        self.push_flag(flag, &value.to_string());
        Ok(())
    }

    pub fn push_manifest_or_pair(
        &mut self,
        first: (&str, &str),
        second: (&str, &str),
    ) -> Result<(), ProtocolError> {
        let (first_key, first_flag) = first;
        let (second_key, second_flag) = second;
        let manifest = self.opt_str("manifest")?;
        let first_val = self.opt_str(first_key)?;
        let second_val = self.opt_str(second_key)?;
        match (manifest, first_val, second_val) {
            (Some(path), None, None) => self.args.push(path.into()),
            (None, Some(first), Some(second)) => {
                self.push_flag(first_flag, first);
                self.push_flag(second_flag, second);
            }
            (Some(_), _, _) => {
                return Err(self.invalid(&format!(
                    "'manifest' cannot be combined with '{first_key}' or '{second_key}'"
                )))
            }
            _ => {
                return Err(self.invalid(&format!(
                    "provide either 'manifest' or both '{first_key}' and '{second_key}'"
                )))
            }
        }
        Ok(())
    }

    pub fn push_manifest_or_triplet(
        &mut self,
        direct: [(&str, &str); 3],
    ) -> Result<(), ProtocolError> {
        let manifest = self.opt_str("manifest")?;
        let values = [
            self.opt_str(direct[0].0)?,
            self.opt_str(direct[1].0)?,
            self.opt_str(direct[2].0)?,
        ];
        if let Some(path) = manifest {
            if values.iter().any(Option::is_some) {
                return Err(self.invalid("'manifest' cannot be combined with direct experiment inputs"));
            }
            self.args.push(path.into());
            return Ok(());
        }
        if values.iter().any(Option::is_none) {
            return Err(self.invalid("provide either 'manifest' or all direct experiment inputs"));
        }
        for ((_, flag), value) in direct.into_iter().zip(values) {
            self.push_flag(flag, value.expect("validated direct experiment input"));
        }
        Ok(())
    }

    pub fn push_opt_experiment_root(&mut self) -> Result<(), ProtocolError> {
        if let Some(root) = self.opt_str("root")? {
            self.push_flag("--root", root);
        }
        Ok(())
    }

    pub fn push_experiment_tail(&mut self) -> Result<(), ProtocolError> {
        self.push_opt_experiment_root()?;
        if self.opt_bool("summary")?.unwrap_or(false) {
            self.args.push("--summary".into());
        }
        self.push_flag("--format", "json");
        Ok(())
    }

    pub fn finish(self) -> PlannedCommand {
        PlannedCommand {
            operation: self.operation.to_string(),
            args: self.args,
        }
    }
}
