import { Router } from 'express';
import * as projectsController from './projects.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import {
  addProjectMemberSchema,
  createProjectSchema,
  createSectionSchema,
  updateProjectMemberRoleSchema,
  updateProjectSchema,
  updateSectionSchema,
} from './projects.schemas';

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get('/', projectsController.listProjects);
projectsRouter.post('/', validateBody(createProjectSchema), projectsController.createProject);
projectsRouter.get('/:id', projectsController.getProject);
projectsRouter.patch('/:id', validateBody(updateProjectSchema), projectsController.updateProject);
projectsRouter.delete('/:id', projectsController.deleteProject);

projectsRouter.post('/:id/members', validateBody(addProjectMemberSchema), projectsController.addMember);
projectsRouter.patch('/:id/members/:userId', validateBody(updateProjectMemberRoleSchema), projectsController.updateMemberRole);
projectsRouter.delete('/:id/members/:userId', projectsController.removeMember);

projectsRouter.post('/:id/sections', validateBody(createSectionSchema), projectsController.createSection);
projectsRouter.patch('/sections/:sectionId', validateBody(updateSectionSchema), projectsController.updateSection);
projectsRouter.delete('/sections/:sectionId', projectsController.deleteSection);
