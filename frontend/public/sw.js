self.addEventListener("push", (event) => {
  let payload = {
    title: "WeekWise reminder",
    body: "You have an upcoming plan item.",
    data: {},
  }

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() }
    } catch {
      payload.body = event.data.text()
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: payload.data,
      icon: "/vite.svg",
      badge: "/vite.svg",
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow("/"))
})
