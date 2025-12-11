/**
 * Dependency Injection Container
 * 
 * Simple manual DI container (can be replaced with TSyringe/Awilix later)
 */

import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../../db/database';

// Repositories
import { UserRepository } from '../database/repositories/UserRepository';
import { ConversationRepository } from '../database/repositories/ConversationRepository';
import { MessageRepository } from '../database/repositories/MessageRepository';

// Services
import { AuthService } from '../../application/services/AuthService';
import { JWTService } from '../services/JWTService';

// Use Cases
import { LoginUseCase } from '../../application/use-cases/auth/LoginUseCase';
import { SignupUseCase } from '../../application/use-cases/auth/SignupUseCase';
import { CreateConversationUseCase } from '../../application/use-cases/conversation/CreateConversationUseCase';
import { ListConversationsUseCase } from '../../application/use-cases/conversation/ListConversationsUseCase';
import { SendMessageUseCase } from '../../application/use-cases/message/SendMessageUseCase';
import { AcknowledgeMessageUseCase } from '../../application/use-cases/message/AcknowledgeMessageUseCase';

// Controllers
import { AuthController } from '../../presentation/http/controllers/AuthController';
import { ConversationController } from '../../presentation/http/controllers/ConversationController';
import { MessageController } from '../../presentation/http/controllers/MessageController';

export class DIContainer {
  // Infrastructure
  public readonly db: any;
  public readonly jwtService: JWTService;

  // Repositories
  public readonly userRepository: UserRepository;
  public readonly conversationRepository: ConversationRepository;
  public readonly messageRepository: MessageRepository;

  // Services
  public readonly authService: AuthService;

  // Use Cases
  public readonly loginUseCase: LoginUseCase;
  public readonly signupUseCase: SignupUseCase;
  public readonly createConversationUseCase: CreateConversationUseCase;
  public readonly listConversationsUseCase: ListConversationsUseCase;
  public readonly sendMessageUseCase: SendMessageUseCase;
  public readonly acknowledgeMessageUseCase: AcknowledgeMessageUseCase;

  // Controllers
  public readonly authController: AuthController;
  public readonly conversationController: ConversationController;
  public readonly messageController: MessageController;

  constructor(app: FastifyInstance) {
    // 1. Infrastructure Layer
    this.db = getDatabase();
    this.jwtService = new JWTService(app, this.db);

    // 2. Infrastructure - Repositories
    this.userRepository = new UserRepository(this.db);
    this.conversationRepository = new ConversationRepository(this.db);
    this.messageRepository = new MessageRepository(this.db);

    // 3. Application - Services
    this.authService = new AuthService();

    // 4. Application - Use Cases
    this.loginUseCase = new LoginUseCase(
      this.userRepository,
      this.jwtService as any // Cast for now
    );
    this.signupUseCase = new SignupUseCase(
      this.userRepository,
      this.jwtService
    );

    this.createConversationUseCase = new CreateConversationUseCase(
      this.conversationRepository,
      this.userRepository
    );
    this.listConversationsUseCase = new ListConversationsUseCase(
      this.conversationRepository,
      this.messageRepository,
      this.userRepository
    );

    this.sendMessageUseCase = new SendMessageUseCase(
      this.messageRepository,
      this.conversationRepository
    );
    this.acknowledgeMessageUseCase = new AcknowledgeMessageUseCase(
      this.messageRepository,
      this.conversationRepository
    );

    // 5. Presentation - Controllers
    this.authController = new AuthController(
      this.loginUseCase,
      this.signupUseCase
    );
    this.conversationController = new ConversationController(
      this.createConversationUseCase,
      this.listConversationsUseCase
    );
    this.messageController = new MessageController(
      this.sendMessageUseCase,
      this.acknowledgeMessageUseCase
    );
  }

  /**
   * Get all controllers for route registration
   */
  getControllers() {
    return {
      auth: this.authController,
      conversation: this.conversationController,
      message: this.messageController,
    };
  }
}
