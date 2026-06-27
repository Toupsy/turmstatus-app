// ============================================================
// Dashboard-API – Kennzahlen für die Hauptwache
// ============================================================

const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../db/connection');
const { requireAuth, viewScope } = require('../middleware');

router.use(requireAuth);

// GET /api/dashboard/summary – Lage-Kennzahlen des eigenen Scopes (Admin: alle)
router.get('/summary', async (req, res) => {
  try {
    const scope = viewScope(req.user);
    // Owner-Filter pro Tabelle (Mandanten-Isolation); Admin sieht alles.
    const ownF = (alias) => scope.all ? '' : ` WHERE ${alias}owner_id = ?`;
    const p = scope.all ? [] : [scope.scopeId];

    const towerCount = (await dbGet(`SELECT COUNT(*) AS n FROM towers${ownF('')}`, p)).n;
    const guardStatus = await dbAll(`SELECT status, COUNT(*) AS n FROM guards${ownF('')} GROUP BY status`, p);
    const boatStatus = await dbAll(`SELECT status, COUNT(*) AS n FROM boats${ownF('')} GROUP BY status`, p);
    const openRequests = (await dbGet(
      `SELECT COUNT(*) AS n FROM minus_one_requests r JOIN guards g ON g.id = r.guard_id
        WHERE r.status = 'PENDING'${scope.all ? '' : ' AND g.owner_id = ?'}`,
      scope.all ? [] : [scope.scopeId]
    )).n;

    const guardByStatus = Object.fromEntries(guardStatus.map(r => [r.status, r.n]));
    const boatByStatus = Object.fromEntries(boatStatus.map(r => [r.status, r.n]));
    const totalGuards = guardStatus.reduce((s, r) => s + r.n, 0);

    res.json({
      towers: towerCount,
      guardsTotal: totalGuards,
      guardsInArea: guardByStatus.IN_AREA || 0,
      guardsMinusOne: guardByStatus.MINUS_ONE || 0,
      guardsDeployed: guardByStatus.DEPLOYED || 0,
      guardsBreak: guardByStatus.BREAK || 0,
      boatsTotal: boatStatus.reduce((s, r) => s + r.n, 0),
      boatsByStatus: boatByStatus,
      openRequests
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to build summary' });
  }
});

module.exports = router;
