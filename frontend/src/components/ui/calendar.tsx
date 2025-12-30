"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { cn } from "../../lib/utils"
import "./calendar.css"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = false,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("rdp-calendar", className)}
      classNames={{
        months: "rdp-months",
        month: "rdp-month",
        caption: "rdp-caption",
        caption_label: "rdp-caption-label",
        nav: "rdp-nav",
        button_previous: "rdp-button rdp-button_previous",
        button_next: "rdp-button rdp-button_next",
        month_grid: "rdp-month-grid",
        weekdays: "rdp-weekdays",
        weekday: "rdp-weekday",
        week: "rdp-week",
        day: "rdp-day",
        day_button: "rdp-day_button",
        day_selected: "rdp-day_selected",
        day_today: "rdp-day_today",
        day_outside: "rdp-day_outside",
        day_disabled: "rdp-day_disabled",
        day_range_middle: "rdp-day_range_middle",
        day_hidden: "rdp-day_hidden",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...props }) => {
          if (orientation === "left") {
            return <ChevronLeft className="rdp-icon" {...props} />
          }
          return <ChevronRight className="rdp-icon" {...props} />
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
