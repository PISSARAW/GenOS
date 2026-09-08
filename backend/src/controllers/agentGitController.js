const agentGit = require('../services/agentGitService');

async function push(req, res, next) { try { res.status(201).json(await agentGit.push(req)); } catch (error) { next(error); } }
async function fetch(req, res, next) { try { res.json(await agentGit.fetch(req)); } catch (error) { next(error); } }
async function pull(req, res, next) { try { res.json(await agentGit.pull(req)); } catch (error) { next(error); } }
async function stash(req, res, next) { try { res.status(201).json(await agentGit.stash(req)); } catch (error) { next(error); } }
async function tag(req, res, next) { try { res.status(201).json(await agentGit.tag(req)); } catch (error) { next(error); } }
async function cherryPick(req, res, next) { try { res.json(await agentGit.cherryPick(req)); } catch (error) { next(error); } }
async function commit(req, res, next) { try { res.status(201).json({ success: true, operation: 'commit', ...(await agentGit.createCommit(req, { agentId: req.body?.agentId, refName: req.body?.refName || 'main', metadata: { message: req.body?.message || '' } })) }); } catch (error) { next(error); } }

module.exports = { push, fetch, pull, stash, tag, cherryPick, commit };
