/**
 * DOM helpers สำหรับ form validation UX เฉพาะฝั่ง client (browser-only).
 * ใช้ภายใน event handler เช่น onSubmit เท่านั้น เพราะเรียก window/document.
 */

/**
 * เลื่อน scroll container ของ form ไปยัง field แรกที่แสดงสถานะ error แล้วโฟกัส input นั้น.
 * ค้นหา error field ด้วย class ที่ form components ของ master-data ใช้อยู่
 * (border-red-400 / bg-red-50/50 / text-red-700) เพื่อให้ใช้ได้โดยไม่ต้องเพิ่ม data attribute.
 *
 * @param formElement form ที่กำลัง submit/validate
 * @param offset ระยะ padding ด้านบนเมื่อ scroll (px) เพื่อไม่ให้ field ติดขอบบน
 */
export function scrollToFirstFormError(formElement: HTMLFormElement, offset = 60) {
  if (typeof window === 'undefined') return

  window.setTimeout(() => {
    const scrollContainer = formElement.querySelector<HTMLElement>('.overflow-y-auto')
    const firstInvalid = formElement.querySelector<HTMLElement>('.border-red-400, .bg-red-50\\/50, .text-red-700')
    if (!firstInvalid) return

    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect()
      const invalidRect = firstInvalid.getBoundingClientRect()
      const relativeTop = invalidRect.top - containerRect.top + scrollContainer.scrollTop
      const targetScrollTop = Math.max(0, relativeTop - offset)
      scrollContainer.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
    }

    const inputToFocus = firstInvalid.tagName === 'INPUT' || firstInvalid.tagName === 'SELECT' || firstInvalid.tagName === 'TEXTAREA'
      ? firstInvalid
      : firstInvalid.querySelector<HTMLElement>('input, select, textarea')
    if (inputToFocus) {
      try {
        inputToFocus.focus({ preventScroll: true })
      } catch {
        inputToFocus.focus()
      }
    }
  }, 60)
}
