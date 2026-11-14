export function spoilerParts(text:string):{text:string,hidden:boolean}[];
export function spoilerSummary(text:string):string;
export function concealNode(node:HTMLElement):HTMLSpanElement;
export function protectSpoilers(root:HTMLElement):void;
export function safeCopy(root:HTMLElement):{text:string,html:string};

export function decorateSpoiler(button:HTMLElement,text:string):void;

export function disposeSpoiler(element:HTMLElement,burst?:boolean):void;
