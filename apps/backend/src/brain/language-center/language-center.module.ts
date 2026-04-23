import { Module } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { PiModelRegistryService } from './pi-model-registry.service';
import { LlmService } from './llm.service';
import { ProviderAuthService } from './provider-auth.service';

@Module({
  providers: [
    ModelConfigService,
    PiModelRegistryService,
    ProviderAuthService,
    LlmService,
  ],
  exports: [
    ModelConfigService,
    PiModelRegistryService,
    ProviderAuthService,
    LlmService,
  ],
})
export class BrainLanguageCenterModule {}
