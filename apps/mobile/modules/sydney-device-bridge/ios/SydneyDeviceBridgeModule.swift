import Contacts
import EventKit
import ExpoModulesCore
import Foundation
import UIKit

public class SydneyDeviceBridgeModule: Module {
  private let eventStore = EKEventStore()
  private let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
  }()

  private static func hasInfoPlistKey(_ key: String) -> Bool {
    guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String else {
      return false
    }
    return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private static func calendarDeclared() -> Bool {
    hasInfoPlistKey("NSCalendarsUsageDescription")
      || hasInfoPlistKey("NSCalendarsFullAccessUsageDescription")
  }

  private static func remindersDeclared() -> Bool {
    hasInfoPlistKey("NSRemindersUsageDescription")
      || hasInfoPlistKey("NSRemindersFullAccessUsageDescription")
  }

  private static func contactsDeclared() -> Bool {
    hasInfoPlistKey("NSContactsUsageDescription")
  }

  private static func mapEventStatus(_ status: EKAuthorizationStatus) -> String {
    if #available(iOS 17.0, *) {
      switch status {
      case .fullAccess, .writeOnly:
        return "authorized"
      case .denied:
        return "denied"
      case .restricted:
        return "restricted"
      case .notDetermined:
        return "notDetermined"
      @unknown default:
        return "notDetermined"
      }
    } else {
      switch status {
      case .authorized:
        return "authorized"
      case .denied:
        return "denied"
      case .restricted:
        return "restricted"
      case .notDetermined:
        return "notDetermined"
      @unknown default:
        return "notDetermined"
      }
    }
  }

  private static func mapContactsStatus(_ status: CNAuthorizationStatus) -> String {
    switch status {
    case .authorized:
      return "authorized"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    case .notDetermined:
      return "notDetermined"
    @unknown default:
      return "authorized"
    }
  }

  private func requestEventAccess() async -> Bool {
    guard Self.calendarDeclared() else { return false }
    if #available(iOS 17.0, *) {
      do {
        return try await eventStore.requestFullAccessToEvents()
      } catch {
        return false
      }
    } else {
      return await withCheckedContinuation { cont in
        eventStore.requestAccess(to: .event) { granted, _ in
          cont.resume(returning: granted)
        }
      }
    }
  }

  private func requestReminderAccess() async -> Bool {
    guard Self.remindersDeclared() else { return false }
    if #available(iOS 17.0, *) {
      do {
        return try await eventStore.requestFullAccessToReminders()
      } catch {
        return false
      }
    } else {
      return await withCheckedContinuation { cont in
        eventStore.requestAccess(to: .reminder) { granted, _ in
          cont.resume(returning: granted)
        }
      }
    }
  }

  private func requestContactAccess() async -> Bool {
    guard Self.contactsDeclared() else { return false }
    let store = CNContactStore()
    return await withCheckedContinuation { cont in
      store.requestAccess(for: .contacts) { granted, _ in
        cont.resume(returning: granted)
      }
    }
  }

  private func parseIsoDate(_ raw: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let parsed = fractional.date(from: raw) {
      return parsed
    }
    return isoFormatter.date(from: raw)
  }

  public func definition() -> ModuleDefinition {
    Name("SydneyDeviceBridge")

    Function("isAvailable") { () -> Bool in
      true
    }

    Function("getAuthorizationStatuses") { () -> [String: String] in
      let calendar = Self.calendarDeclared()
        ? Self.mapEventStatus(EKEventStore.authorizationStatus(for: .event))
        : "unavailable"
      let reminders = Self.remindersDeclared()
        ? Self.mapEventStatus(EKEventStore.authorizationStatus(for: .reminder))
        : "unavailable"
      let contacts = Self.contactsDeclared()
        ? Self.mapContactsStatus(CNContactStore.authorizationStatus(for: .contacts))
        : "unavailable"
      return [
        "calendar": calendar,
        "reminders": reminders,
        "contacts": contacts,
        "clipboard": "authorized",
      ]
    }

    AsyncFunction("requestPermission") { (domain: String) async -> String in
      switch domain {
      case "calendar":
        _ = await self.requestEventAccess()
        return Self.calendarDeclared()
          ? Self.mapEventStatus(EKEventStore.authorizationStatus(for: .event))
          : "unavailable"
      case "reminders":
        _ = await self.requestReminderAccess()
        return Self.remindersDeclared()
          ? Self.mapEventStatus(EKEventStore.authorizationStatus(for: .reminder))
          : "unavailable"
      case "contacts":
        _ = await self.requestContactAccess()
        return Self.contactsDeclared()
          ? Self.mapContactsStatus(CNContactStore.authorizationStatus(for: .contacts))
          : "unavailable"
      case "clipboard":
        return "authorized"
      default:
        return "unavailable"
      }
    }

    AsyncFunction("listCalendarEvents") { (daysBack: Int?, daysAhead: Int?, limit: Int?) async -> [String: Any] in
      let status = Self.calendarDeclared()
        ? Self.mapEventStatus(EKEventStore.authorizationStatus(for: .event))
        : "unavailable"
      guard status == "authorized" else {
        return ["authorizationStatus": status, "events": []]
      }
      let now = Date()
      let back = max(0, min(daysBack ?? 1, 7))
      let ahead = max(1, min(daysAhead ?? 14, 60))
      let cap = max(1, min(limit ?? 50, 60))
      let start = Calendar.current.date(byAdding: .day, value: -back, to: now) ?? now
      let end = Calendar.current.date(byAdding: .day, value: ahead, to: now) ?? now.addingTimeInterval(14 * 86400)
      let predicate = self.eventStore.predicateForEvents(withStart: start, end: end, calendars: nil)
      let rawEvents = self.eventStore.events(matching: predicate)
        .sorted { $0.startDate < $1.startDate }
        .prefix(cap)
      let items: [[String: Any]] = rawEvents.map { ev in
        var row: [String: Any] = [
          "id": ev.eventIdentifier ?? UUID().uuidString,
          "title": String((ev.title ?? "").prefix(240)),
          "startAt": self.isoFormatter.string(from: ev.startDate),
          "endAt": self.isoFormatter.string(from: ev.endDate),
          "allDay": ev.isAllDay,
        ]
        if let location = ev.location?.trimmingCharacters(in: .whitespacesAndNewlines), !location.isEmpty {
          row["location"] = String(location.prefix(240))
        }
        if let calTitle = ev.calendar?.title, !calTitle.isEmpty {
          row["calendarTitle"] = String(calTitle.prefix(120))
        }
        if let notes = ev.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
          row["notes"] = String(notes.prefix(500))
        }
        return row
      }
      return ["authorizationStatus": status, "events": items]
    }

    AsyncFunction("createCalendarEvent") {
      (title: String, startAt: String, endAt: String, allDay: Bool?, location: String?, notes: String?) async throws -> [String: Any] in
      guard Self.calendarDeclared() else {
        throw NSError(domain: "SydneyDeviceBridge", code: 1, userInfo: [NSLocalizedDescriptionKey: "calendar_unavailable"])
      }
      let status = Self.mapEventStatus(EKEventStore.authorizationStatus(for: .event))
      if status != "authorized" {
        let granted = await self.requestEventAccess()
        if !granted {
          throw NSError(domain: "SydneyDeviceBridge", code: 2, userInfo: [NSLocalizedDescriptionKey: "calendar_denied"])
        }
      }
      guard let startDate = self.parseIsoDate(startAt), let endDate = self.parseIsoDate(endAt) else {
        throw NSError(domain: "SydneyDeviceBridge", code: 3, userInfo: [NSLocalizedDescriptionKey: "invalid_date"])
      }
      let event = EKEvent(eventStore: self.eventStore)
      event.title = String(title.prefix(240))
      event.startDate = startDate
      event.endDate = endDate >= startDate ? endDate : startDate.addingTimeInterval(3600)
      event.isAllDay = allDay ?? false
      if let location, !location.isEmpty { event.location = String(location.prefix(240)) }
      if let notes, !notes.isEmpty { event.notes = String(notes.prefix(500)) }
      event.calendar = self.eventStore.defaultCalendarForNewEvents
      try self.eventStore.save(event, span: .thisEvent)
      return ["ok": true, "id": event.eventIdentifier ?? ""]
    }

    AsyncFunction("listReminders") { (limit: Int?) async -> [String: Any] in
      let status = Self.remindersDeclared()
        ? Self.mapEventStatus(EKEventStore.authorizationStatus(for: .reminder))
        : "unavailable"
      guard status == "authorized" else {
        return ["authorizationStatus": status, "items": []]
      }
      let cap = max(1, min(limit ?? 50, 60))
      let predicate = self.eventStore.predicateForReminders(in: nil)
      let reminders: [EKReminder] = await withCheckedContinuation { cont in
        self.eventStore.fetchReminders(matching: predicate) { fetched in
          cont.resume(returning: fetched ?? [])
        }
      }
      let sorted = reminders.sorted { a, b in
        if a.isCompleted != b.isCompleted { return !a.isCompleted }
        let da = a.dueDateComponents?.date ?? Date.distantFuture
        let db = b.dueDateComponents?.date ?? Date.distantFuture
        return da < db
      }
      let items: [[String: Any]] = sorted.prefix(cap).map { rem in
        var row: [String: Any] = [
          "id": rem.calendarItemIdentifier,
          "title": String((rem.title ?? "").prefix(240)),
          "completed": rem.isCompleted,
          "priority": rem.priority,
        ]
        if let due = rem.dueDateComponents?.date {
          row["dueAt"] = self.isoFormatter.string(from: due)
        }
        if let listTitle = rem.calendar?.title, !listTitle.isEmpty {
          row["listTitle"] = String(listTitle.prefix(120))
        }
        if let notes = rem.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
          row["notes"] = String(notes.prefix(500))
        }
        return row
      }
      return ["authorizationStatus": status, "items": items]
    }

    AsyncFunction("createReminder") {
      (title: String, dueAt: String?, notes: String?, priority: Int?) async throws -> [String: Any] in
      guard Self.remindersDeclared() else {
        throw NSError(domain: "SydneyDeviceBridge", code: 1, userInfo: [NSLocalizedDescriptionKey: "reminders_unavailable"])
      }
      let status = Self.mapEventStatus(EKEventStore.authorizationStatus(for: .reminder))
      if status != "authorized" {
        let granted = await self.requestReminderAccess()
        if !granted {
          throw NSError(domain: "SydneyDeviceBridge", code: 2, userInfo: [NSLocalizedDescriptionKey: "reminders_denied"])
        }
      }
      let reminder = EKReminder(eventStore: self.eventStore)
      reminder.title = String(title.prefix(240))
      if let notes, !notes.isEmpty { reminder.notes = String(notes.prefix(500)) }
      if let priority { reminder.priority = max(0, min(9, priority)) }
      if let dueAt, !dueAt.isEmpty, let date = self.parseIsoDate(dueAt) {
        reminder.dueDateComponents = Calendar.current.dateComponents(
          [.year, .month, .day, .hour, .minute],
          from: date
        )
      }
      reminder.calendar = self.eventStore.defaultCalendarForNewReminders()
      try self.eventStore.save(reminder, commit: true)
      return ["ok": true, "id": reminder.calendarItemIdentifier]
    }

    AsyncFunction("listContacts") { (limit: Int?) async -> [String: Any] in
      let status = Self.contactsDeclared()
        ? Self.mapContactsStatus(CNContactStore.authorizationStatus(for: .contacts))
        : "unavailable"
      guard status == "authorized" else {
        return ["authorizationStatus": status, "totalCount": 0, "items": []]
      }
      let cap = max(1, min(limit ?? 250, 300))
      let store = CNContactStore()
      let keys: [CNKeyDescriptor] = [
        CNContactIdentifierKey as CNKeyDescriptor,
        CNContactGivenNameKey as CNKeyDescriptor,
        CNContactFamilyNameKey as CNKeyDescriptor,
        CNContactOrganizationNameKey as CNKeyDescriptor,
        CNContactPhoneNumbersKey as CNKeyDescriptor,
        CNContactEmailAddressesKey as CNKeyDescriptor,
      ]
      let request = CNContactFetchRequest(keysToFetch: keys)
      var total = 0
      var items: [[String: Any]] = []
      do {
        try store.enumerateContacts(with: request) { contact, _ in
          total += 1
          guard items.count < cap else { return }
          let fullName = [contact.familyName, contact.givenName]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
          let fallbackName = contact.organizationName.trimmingCharacters(in: .whitespacesAndNewlines)
          let name = fullName.isEmpty ? fallbackName : fullName
          guard !name.isEmpty else { return }
          let phones = contact.phoneNumbers.prefix(6).map { String($0.value.stringValue.prefix(48)) }
          let emails = contact.emailAddresses.prefix(6).map { String(($0.value as String).prefix(160)) }
          var row: [String: Any] = [
            "id": String(contact.identifier.prefix(160)),
            "name": String(name.prefix(160)),
            "phones": phones,
            "emails": emails,
          ]
          if !fallbackName.isEmpty {
            row["organization"] = String(fallbackName.prefix(160))
          }
          items.append(row)
        }
      } catch {
        return ["authorizationStatus": status, "totalCount": 0, "items": []]
      }
      return ["authorizationStatus": status, "totalCount": total, "items": items]
    }

    AsyncFunction("readClipboard") { () async -> [String: Any] in
      await MainActor.run {
        let hasStrings = UIPasteboard.general.hasStrings
        let text = hasStrings ? (UIPasteboard.general.string ?? "") : ""
        let trimmed = String(text.prefix(4000))
        return [
          "hasText": !trimmed.isEmpty,
          "textPreview": trimmed,
          "updatedAt": Int(Date().timeIntervalSince1970 * 1000.0),
        ]
      }
    }

    AsyncFunction("writeClipboard") { (text: String) async -> [String: Any] in
      let clipped = String(text.prefix(4000))
      await MainActor.run {
        UIPasteboard.general.string = clipped
      }
      return ["ok": true]
    }
  }
}
