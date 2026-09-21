import { Router } from 'express';
import * as documentsController from './documents.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import {
  addCollaboratorSchema,
  createDocumentSchema,
  createVersionSchema,
  updateCollaboratorRoleSchema,
  updateDocumentTitleSchema,
  updateDocumentVisibilitySchema,
} from './documents.schemas';

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

documentsRouter.get('/', documentsController.listDocuments);
documentsRouter.post('/', validateBody(createDocumentSchema), documentsController.createDocument);
documentsRouter.get('/:id', documentsController.getDocument);
documentsRouter.patch('/:id', validateBody(updateDocumentTitleSchema), documentsController.updateDocumentTitle);
documentsRouter.patch(
  '/:id/visibility',
  validateBody(updateDocumentVisibilitySchema),
  documentsController.updateDocumentVisibility,
);
documentsRouter.delete('/:id', documentsController.deleteDocument);

documentsRouter.post('/:id/collaborators', validateBody(addCollaboratorSchema), documentsController.addCollaborator);
documentsRouter.patch(
  '/:id/collaborators/:userId',
  validateBody(updateCollaboratorRoleSchema),
  documentsController.updateCollaboratorRole,
);
documentsRouter.delete('/:id/collaborators/:userId', documentsController.removeCollaborator);

documentsRouter.get('/:id/versions', documentsController.listVersions);
documentsRouter.get('/:id/versions/:versionId', documentsController.getVersion);
documentsRouter.post('/:id/versions', validateBody(createVersionSchema), documentsController.createVersion);
documentsRouter.post('/:id/versions/:versionId/restore', documentsController.restoreVersion);
