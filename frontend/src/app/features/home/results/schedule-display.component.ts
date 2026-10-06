import { Component, Input, OnChanges, ViewEncapsulation, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RawSchedule, GroupedSchedule, groupConsecutiveSchedules, formatScheduleTime } from './schedule-utils';

@Component({
  selector: 'app-schedule-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './schedule-display.component.html',
  encapsulation: ViewEncapsulation.None
})
export class ScheduleDisplayComponent implements OnChanges {
  @Input() schedules: readonly RawSchedule[] | null | undefined;
  
  groupedSchedules: GroupedSchedule[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['schedules']) {
      this.groupedSchedules = groupConsecutiveSchedules(this.schedules ? [...this.schedules] : this.schedules);
    }
  }

  formatTime(timeStr?: string | null): string {
    return formatScheduleTime(timeStr);
  }
}
