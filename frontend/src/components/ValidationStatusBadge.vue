<script setup lang="ts">
import { computed } from 'vue'
import type { ValidationStatus } from '@/types'

const props = defineProps<{
  status: ValidationStatus
  lastVerifiedUtc?: string | null
}>()

const label = computed(() => {
  switch (props.status) {
    case 'verified':  return 'Verified'
    case 'warning':   return 'Warning'
    case 'critical':  return 'Critical'
    case 'inactive':  return 'Inactive'
    case 'pending':   return 'Pending'
  }
})

const tooltip = computed(() => {
  if (props.status === 'verified' && props.lastVerifiedUtc) {
    return `Last verified: ${timeAgo(props.lastVerifiedUtc)}`
  }
  if (props.status === 'warning') {
    return props.lastVerifiedUtc
      ? `Not seen for 6–24 hours. Last verified: ${timeAgo(props.lastVerifiedUtc)}`
      : 'Not seen for 6–24 hours'
  }
  if (props.status === 'critical') {
    return props.lastVerifiedUtc
      ? `Not seen for 24+ hours. Last verified: ${timeAgo(props.lastVerifiedUtc)}`
      : 'Never verified or missing for 24+ hours'
  }
  if (props.status === 'pending') return 'Recently added — awaiting first verified race'
  if (props.status === 'inactive') return 'Pool is inactive or removed from tracking'
  return ''
})

function timeAgo(utc: string): string {
  const ts = new Date(utc).getTime()
  if (isNaN(ts)) return 'unknown'
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
</script>

<template>
  <span
    class="badge"
    :class="`badge--${status}`"
    :title="tooltip"
    role="status"
    :aria-label="`Validation status: ${label}`"
  >
    <span class="badge__dot" :class="{ 'badge__dot--pulse': status === 'critical' }"></span>
    {{ label }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  white-space: nowrap;
  cursor: default;
}

.badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.badge__dot--pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.8); }
}

.badge--verified {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}
.badge--verified .badge__dot { background: #4ade80; }

.badge--warning {
  background: rgba(234, 179, 8, 0.15);
  color: #facc15;
}
.badge--warning .badge__dot { background: #facc15; }

.badge--critical {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}
.badge--critical .badge__dot { background: #f87171; }

.badge--inactive {
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-secondary);
}
.badge--inactive .badge__dot { background: var(--text-secondary); }

.badge--pending {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}
.badge--pending .badge__dot { background: #818cf8; }
</style>
