<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
import { toast } from 'vue-sonner';

const config = useRuntimeConfig();
const identity = useIdentityStore();
const loading = ref(false);
const nameError = ref<string | null>(null);

onMounted(() => identity.restore());

const trimmedName = computed(() => identity.displayName.trim());

function onDisplayNameInput(v: string | number) {
  identity.displayName = String(v);
  nameError.value = null;
}

function validateName(): boolean {
  if (!trimmedName.value) {
    nameError.value = 'Pick a display name so friends know who played the Draw 4.';
    return false;
  }
  if (trimmedName.value.length > 32) {
    nameError.value = 'Keep it under 32 characters so it fits in the lobby.';
    return false;
  }
  nameError.value = null;
  return true;
}

async function createRoom() {
  if (!validateName()) return;
  identity.displayName = trimmedName.value;
  identity.persist();
  loading.value = true;
  try {
    const res = await $fetch<{ inviteUrl: string }>(`${config.public.apiBase}/rooms`, {
      method: 'POST',
      body: { maxPlayers: 16, public: false },
    });
    const sep = res.inviteUrl.includes('?') ? '&' : '?';
    // Host already set name/avatar on this screen; skip the invitee join gate on the room page.
    await navigateTo(`${res.inviteUrl}${sep}from=create`);
  } catch {
    toast.error('Could not create a room. Is the API server running?');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center pb-8">
    <Card class="border-border/80 shadow-xl shadow-black/20">
      <CardHeader class="space-y-1">
        <p class="text-xs font-semibold uppercase tracking-[0.35em] text-primary">UNO · real-time</p>
        <CardTitle class="text-3xl font-bold tracking-tight sm:text-4xl">Instant WebRTC UNO</CardTitle>
        <CardDescription class="text-base leading-relaxed">
          Pick a name and avatar, share one link, and play with friends and bots. Everything stays on this device until you join a room — no account.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="space-y-2">
          <Label for="display-name">Display name</Label>
          <Input
            id="display-name"
            :model-value="identity.displayName"
            autocomplete="nickname"
            maxlength="40"
            placeholder="e.g. TableShark_02"
            class="h-11"
            :aria-invalid="nameError ? 'true' : undefined"
            @blur="() => identity.persist()"
            @update:model-value="onDisplayNameInput"
          />
          <p v-if="nameError" class="text-sm text-destructive">{{ nameError }}</p>
        </div>
        <div class="space-y-3">
          <AvatarEmojiPicker />
          <Badge variant="secondary" class="inline-flex h-9 px-3 py-1 text-sm font-normal text-muted-foreground">
            Saved only in this browser
          </Badge>
        </div>
      </CardContent>
      <CardFooter class="flex flex-col gap-3 border-t border-border/60 bg-muted/20 pt-6 sm:flex-row sm:justify-end">
        <Button
          class="h-11 min-w-[11rem] font-semibold"
          size="lg"
          :disabled="loading"
          @click="createRoom"
        >
          <Loader2 v-if="loading" class="size-4 animate-spin" aria-hidden="true" />
          <span v-if="loading">Creating…</span>
          <span v-else>Create room</span>
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
