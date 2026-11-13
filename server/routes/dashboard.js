import { Router } from 'express';
import { many, one } from '../db.js';
import { requireAuth } from '../middleware.js';
import { autoCloseChallenges } from './challenges.js';
import { projectProgress } from './projects.js';
import { profileStatus } from './profiles.js';
import { adminSummary } from './admin.js';

const router = Router();

