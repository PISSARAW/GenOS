const agentGit = require('../services/agentGitService');

async function push(req, res, next) { try { res.status(201).json(await agentGit.push(req)); } catch (error) { next(error); } }
async function fetch(req, res, next) { try { res.json(await agentGit.fetch(req)); } catch (error) { next(error); } }
async function pull(req, res, next) { try { res.json(await agentGit.pull(req)); } catch (error) { next(error); } }
async function stash(req, res, next) { try { res.status(201).json(await agentGit.stash(req)); } catch (error) { next(error); } }
async function tag(req, res, next) { try { res.status(201).json(await agentGit.tag(req)); } catch (error) { next(error); } }
async function cherryPick(req, res, next) { try { res.json(await agentGit.cherryPick(req)); } catch (error) { next(error); } }
async function commit(req, res, next) { try { res.status(201).json({ success: true, operation: 'commit', ...(await agentGit.createCommit(req, { agentId: req.body?.agentId, refName: req.body?.refName || 'main', metadata: { message: req.body?.message || '' } })) }); } catch (error) { next(error); } }
async function diff(req, res, next) { try { res.json(await agentGit.diff(req)); } catch (error) { next(error); } }
async function merge(req, res, next) { try { res.status(201).json(await agentGit.merge(req)); } catch (error) { next(error); } }
async function replay(req, res, next) { try { res.json(await agentGit.replay(req)); } catch (error) { next(error); } }
async function bisect(req, res, next) { try { res.json(await agentGit.bisect(req)); } catch (error) { next(error); } }
async function log(req, res, next) { try { res.json(await agentGit.log(req)); } catch (error) { next(error); } }
async function revert(req, res, next) { try { res.status(201).json(await agentGit.revert(req)); } catch (error) { next(error); } }
async function rebase(req, res, next) { try { res.status(201).json(await agentGit.rebase(req)); } catch (error) { next(error); } }
async function remoteReceive(req, res, next) { try { res.status(201).json(await agentGit.receiveRemote(req)); } catch (error) { next(error); } }
async function reflog(req, res, next) { try { res.json(await agentGit.reflog(req)); } catch (error) { next(error); } }
async function show(req, res, next) { try { res.json(await agentGit.show(req)); } catch (error) { next(error); } }
async function fsck(req, res, next) { try { res.json(await agentGit.fsck(req)); } catch (error) { next(error); } }
async function gc(req, res, next) { try { res.json(await agentGit.gc(req)); } catch (error) { next(error); } }
async function blame(req, res, next) { try { res.json(await agentGit.blame(req)); } catch (error) { next(error); } }
async function describe(req, res, next) { try { res.json(await agentGit.describe(req)); } catch (error) { next(error); } }
async function note(req, res, next) { try { res.status(201).json(await agentGit.note(req)); } catch (error) { next(error); } }
async function hook(req, res, next) { try { res.status(201).json(await agentGit.hook(req)); } catch (error) { next(error); } }
async function mergeBase(req, res, next) { try { res.json(await agentGit.mergeBase(req)); } catch (error) { next(error); } }
async function archive(req, res, next) { try { res.status(201).json(await agentGit.archive(req)); } catch (error) { next(error); } }
async function rebaseInteractive(req, res, next) { try { res.status(201).json(await agentGit.rebaseInteractive(req)); } catch (error) { next(error); } }

module.exports = { push, fetch, pull, stash, tag, cherryPick, commit, diff, merge, replay, bisect, log, revert, rebase, rebaseInteractive, remoteReceive, reflog, show, fsck, gc, blame, describe, note, hook, mergeBase, archive };
