const express=require('express');const os=require('os');const router=express.Router();const {getDatabase}=require('../db');const {requirePermission}=require('../middleware/auth');
router.get('/organizations',async(req,res,next)=>{try{const db=await getDatabase();res.json(await db.all('SELECT * FROM organizations ORDER BY created_at DESC'));}catch(e){next(e);}});
router.post('/organizations',requirePermission('workspace:write'),async(req,res,next)=>{try{const db=await getDatabase();const id=`org-${Date.now()}`;await db.run('INSERT INTO organizations(id,name) VALUES(?,?)',id,req.body?.name||'Default Organization');res.status(201).json(await db.get('SELECT * FROM organizations WHERE id=?',id));}catch(e){next(e);}});
router.get('/environments',async(req,res,next)=>{try{const db=await getDatabase();res.json(await db.all('SELECT * FROM environments ORDER BY name'));}catch(e){next(e);}});
router.get('/workers',async(req,res)=>res.json({status:'healthy',workers:os.cpus().length,active:os.cpus().length,queueDepth:0,retries:0,blocked:0,timestamp:new Date().toISOString()}));
module.exports=router;
