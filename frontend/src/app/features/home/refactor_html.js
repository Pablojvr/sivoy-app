const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'home.component.html');
const content = fs.readFileSync(filePath, 'utf-8');

// The start of the list
const listStartStr = '<div *ngIf="destino && flightResults.length > 0 && !loading" class="flight-cards-list">';
const startIndex = content.indexOf(listStartStr);

if (startIndex === -1) {
    console.log("Could not find list start");
    process.exit(1);
}

// Find the corresponding closing div for listStartStr
let openDivs = 0;
let endIndex = -1;
const searchFrom = startIndex + listStartStr.length;

// A simple parser to find the matching </div>
let i = searchFrom;
while (i < content.length) {
    if (content.substring(i, i + 4) === '<div') {
        openDivs++;
        i += 4;
    } else if (content.substring(i, i + 6) === '</div>') {
        if (openDivs === 0) {
            endIndex = i + 6;
            break;
        } else {
            openDivs--;
            i += 6;
        }
    } else {
        i++;
    }
}

if (endIndex === -1) {
    console.log("Could not find matching closing div");
    process.exit(1);
}

const listHtml = content.substring(startIndex, endIndex);

// Inside listHtml, find the ticket-card loop
const ticketStartStr = '<div class="ticket-card" *ngFor="let flight of flightResults" (click)="flight.isExpanded = !flight.isExpanded" [style.cursor]="flightResults.length > 1 ? \'pointer\' : \'default\'">';
const ticketStartIndex = listHtml.indexOf(ticketStartStr);

if (ticketStartIndex === -1) {
    console.log("Could not find ticket start");
    process.exit(1);
}

let ticketOpenDivs = 0;
let ticketEndIndex = -1;
let j = ticketStartIndex + ticketStartStr.length;

while (j < listHtml.length) {
    if (listHtml.substring(j, j + 4) === '<div') {
        ticketOpenDivs++;
        j += 4;
    } else if (listHtml.substring(j, j + 6) === '</div>') {
        if (ticketOpenDivs === 0) {
            ticketEndIndex = j + 6;
            break;
        } else {
            ticketOpenDivs--;
            j += 6;
        }
    } else {
        j++;
    }
}

if (ticketEndIndex === -1) {
    console.log("Could not find ticket end");
    process.exit(1);
}

const ticketHtmlFull = listHtml.substring(ticketStartIndex, ticketEndIndex);
const ticketInnerHtml = listHtml.substring(ticketStartIndex + ticketStartStr.length, ticketEndIndex - 6); // remove outer div

// Process the inner HTML
let processedInner = ticketInnerHtml.replace(/!flight\.isExpanded/g, 'isList');
processedInner = processedInner.replace(/flight\.isExpanded/g, '!isList');
processedInner = processedInner.replace(/!!isList/g, 'isList');

const newHtml = `      <div *ngIf="destino && flightResults.length > 0 && !loading" class="flight-cards-container">
        
        <!-- List Mode -->
        <div class="flight-cards-list" *ngIf="!activeDetailedCard">
          <div class="ticket-card" *ngFor="let flight of flightResults" (click)="viewCardDetails(flight)" style="cursor: pointer;">
             <ng-container *ngTemplateOutlet="ticketCardTemplate; context: { flight: flight, isList: true }"></ng-container>
          </div>
        </div>

        <!-- Detail Mode -->
        <div class="flight-card-detail" *ngIf="activeDetailedCard">
          <button (click)="backToList()" class="back-btn" style="background: transparent; border: none; color: var(--primary); font-weight: 600; padding: 8px 0; margin-bottom: 8px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Volver al listado
          </button>
          
          <div class="ticket-card" style="cursor: default;">
             <ng-container *ngTemplateOutlet="ticketCardTemplate; context: { flight: activeDetailedCard, isList: false }"></ng-container>
          </div>
        </div>

      </div>

      <ng-template #ticketCardTemplate let-flight="flight" let-isList="isList">${processedInner}      </ng-template>`;

const finalContent = content.substring(0, startIndex) + newHtml + content.substring(endIndex);

fs.writeFileSync(filePath, finalContent, 'utf-8');
console.log('Success');
