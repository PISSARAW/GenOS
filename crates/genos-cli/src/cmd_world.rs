use crate::args::{
    WorldCheckFileArgs, WorldCreateArgs, WorldDestroyArgs, WorldDiffArgs, WorldForkArgs,
    WorldProviderKind, WorldReadFileArgs, WorldRunArgs, WorldSnapshotArgs, WorldWriteFileArgs,
};
use crate::output::{
    print_serialized, WorldCheckFileOutput, WorldCreateOutput, WorldDestroyOutput, WorldDiffOutput,
    WorldForkOutput, WorldReadFileOutput, WorldRunOutput, WorldSnapshotOutput,
    WorldWriteFileOutput,
};
use crate::resolve::{provider_from_args, provider_name, WorldProviderConfig};
use anyhow::{bail, Result};
use genos_core::{AgentId, BranchId, SnapshotId, WorldId};
use genos_world::{check_file_isolation, DestroyOutcome, WorldFileExpectation};

pub async fn cmd_world_create(args: WorldCreateArgs) -> Result<()> {
    let provider = provider_from_args(WorldProviderConfig {
        kind: args.provider,
        sandbox_config: None,
        root: args.root,
        seed: args.seed,
        repo: args.repo,
    })?;
    let world_id = provider.create(AgentId::new(), BranchId::new()).await?;

    let out = WorldCreateOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: world_id.0,
    };
    print_serialized(&out, args.format)
}

pub async fn cmd_world_snapshot(args: WorldSnapshotArgs) -> Result<()> {
    let provider = provider_from_args(WorldProviderConfig {
        kind: args.provider,
        sandbox_config: None,
        root: args.root,
        seed: None,
        repo: args.repo,
    })?;
    let world_id = WorldId(args.world_id.clone());
    let snapshot_id = provider.snapshot(world_id).await?;

    let out = WorldSnapshotOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: args.world_id,
        snapshot_id: snapshot_id.0,
    };
    print_serialized(&out, args.format)
}

pub async fn cmd_world_fork(args: WorldForkArgs) -> Result<()> {
    let provider = provider_from_args(WorldProviderConfig {
        kind: args.provider,
        sandbox_config: None,
        root: args.root,
        seed: None,
        repo: args.repo,
    })?;
    let snapshot_id = SnapshotId(args.snapshot_id.clone());
    let worlds = provider.fork_many(snapshot_id, args.count).await?;

    let out = WorldForkOutput {
        provider: provider_name(args.provider).to_string(),
        parent_snapshot_id: args.snapshot_id,
        world_ids: worlds.into_iter().map(|w| w.0).collect(),
    };
    print_serialized(&out, args.format)
}

pub async fn cmd_world_diff(args: WorldDiffArgs) -> Result<()> {
    let provider = provider_from_args(WorldProviderConfig {
        kind: args.provider,
        sandbox_config: None,
        root: args.root,
        seed: None,
        repo: args.repo,
    })?;
    let world_a = WorldId(args.world_a.clone());
    let world_b = WorldId(args.world_b.clone());
    let diff = provider.diff(world_a, world_b).await?;

    let out = WorldDiffOutput {
        provider: provider_name(args.provider).to_string(),
        world_a: args.world_a,
        world_b: args.world_b,
        files_changed: diff.files_changed,
    };
    print_serialized(&out, args.format)
}

pub async fn cmd_world_destroy(args: WorldDestroyArgs) -> Result<()> {
    let provider = provider_from_args(WorldProviderConfig {
        kind: args.provider,
        sandbox_config: None,
        root: args.root,
        seed: None,
        repo: args.repo,
    })?;
    let world_id = WorldId(args.world_id.clone());
    let outcome = provider.destroy(world_id).await?;

    let status = match outcome {
        DestroyOutcome::Destroyed => "destroyed",
        DestroyOutcome::AlreadyAbsent => "already_absent",
    };

    let out = WorldDestroyOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: args.world_id,
        status: status.to_string(),
    };
    print_serialized(&out, args.format)
}

pub async fn cmd_world_read_file(args: WorldReadFileArgs) -> Result<()> {
    let provider = provider_from_args(WorldProviderConfig {
        kind: args.provider,
        sandbox_config: None,
        root: args.root,
        seed: None,
        repo: args.repo,
    })?;
    let world_id = WorldId(args.world_id.clone());
    let contents = provider.read_file(&world_id, &args.path).await?;

    let out = WorldReadFileOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: args.world_id,
        path: args.path,
        found: contents.is_some(),
        contents,
    };
    print_serialized(&out, args.format)
}

pub async fn cmd_world_write_file(args: WorldWriteFileArgs) -> Result<()> {
    let provider = provider_from_args(WorldProviderConfig {
        kind: args.provider,
        sandbox_config: None,
        root: args.root,
        seed: None,
        repo: args.repo,
    })?;
    let world_id = WorldId(args.world_id.clone());

    let previous_contents = provider.read_file(&world_id, &args.path).await?;
    provider
        .write_file(&world_id, &args.path, &args.contents)
        .await?;

    let out = WorldWriteFileOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: args.world_id,
        path: args.path,
        created: previous_contents.is_none(),
        previous_contents,
        contents: args.contents,
    };
    print_serialized(&out, args.format)
}

pub async fn cmd_world_run(args: WorldRunArgs) -> Result<()> {
    let sandbox_config = if args.sandbox_backend.is_some() || !args.sandbox_network {
        Some(genos_world::sandbox::SandboxConfig {
            network_enabled: args.sandbox_network,
            backend: match args.sandbox_backend {
                Some(crate::args::SandboxBackendArg::Bwrap) => {
                    genos_world::sandbox::SandboxBackend::Bwrap
                }
                Some(crate::args::SandboxBackendArg::SandboxExec) => {
                    genos_world::sandbox::SandboxBackend::SandboxExec
                }
                Some(crate::args::SandboxBackendArg::Gvisor) => {
                    genos_world::sandbox::SandboxBackend::GVisor
                }
                Some(crate::args::SandboxBackendArg::Firecracker) => {
                    genos_world::sandbox::SandboxBackend::Firecracker
                }
                Some(crate::args::SandboxBackendArg::None) => {
                    genos_world::sandbox::SandboxBackend::None
                }
                None => genos_world::sandbox::SandboxBackend::None,
            },
            ..Default::default()
        })
    } else {
        None
    };

    let provider = provider_from_args(WorldProviderConfig {
        kind: args.provider,
        root: args.root,
        seed: None,
        repo: args.repo,
        sandbox_config,
    })?;
    let result = provider
        .execute(WorldId(args.world_id.clone()), &args.command)
        .await?;
    let success = result.exit_code == 0;
    let out = WorldRunOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: args.world_id,
        command: args.command,
        exit_code: result.exit_code,
        success,
        stdout: result.stdout,
        stderr: result.stderr,
    };
    print_serialized(&out, args.format)?;
    if !success && !args.allow_failure {
        bail!("world command exited with code {}", out.exit_code);
    }
    Ok(())
}

pub async fn cmd_world_check_file(args: WorldCheckFileArgs) -> Result<()> {
    if args.branches.is_empty() {
        bail!("--branch is required at least once");
    }
    if !args.expects.is_empty() && args.expects.len() != args.branches.len() {
        bail!(
            "--expect must be given once per --branch, in the same order: got {} --branch and {} --expect",
            args.branches.len(),
            args.expects.len()
        );
    }

    let provider = provider_from_args(WorldProviderConfig {
        kind: args.provider,
        sandbox_config: None,
        root: args.root,
        seed: None,
        repo: args.repo,
    })?;
    let parent_world = WorldId(args.parent.clone());

    // Without an explicit expectation, a world is expected to hold what it
    // already holds: the check then only proves the forks diverged.
    let parent_expectation = WorldFileExpectation {
        expected: if args.expect_parent_absent {
            None
        } else {
            match &args.expect_parent {
                Some(expected) => Some(expected.clone()),
                None => provider.read_file(&parent_world, &args.path).await?,
            }
        },
        world_id: parent_world,
    };

    let mut branch_expectations = Vec::with_capacity(args.branches.len());
    for (index, branch) in args.branches.iter().enumerate() {
        let world_id = WorldId(branch.clone());
        let expected = match args.expects.get(index) {
            Some(expected) => Some(expected.clone()),
            None => provider.read_file(&world_id, &args.path).await?,
        };
        branch_expectations.push(WorldFileExpectation { world_id, expected });
    }

    let report = check_file_isolation(
        provider.as_ref(),
        &args.path,
        &parent_expectation,
        &branch_expectations,
    )
    .await?;

    let out = WorldCheckFileOutput {
        provider: provider_name(args.provider).to_string(),
        parent_world_id: args.parent,
        branch_count: branch_expectations.len(),
        report,
    };
    print_serialized(&out, args.format)?;

    if args.expect_isolated && !out.report.isolated {
        bail!(
            "file '{}' is not isolated across worlds: {}",
            args.path,
            out.report.violations.join("; ")
        );
    }

    Ok(())
}

#[allow(dead_code)]
fn _provider_kind_unused(_: WorldProviderKind) {}
