import Adm from "./Adm.jsx";

export default function Resolutor({ user, ticketStatus, onResolved, settings, tickets, onReplyToTicket, onResolveTicket, onAssignTicket, onUpdateTicketPriority, onReturnTicket, onUpdateResolverStatus, onOpenResolverTicket, onSaveProfile, onSavePreferences, onChangePassword, onLogout }) {
  return (
    <Adm
      user={user}
      role="Resolutor"
      settings={settings}
      tickets={tickets}
      ticketStatus={ticketStatus}
      onResolved={onResolved}
      onReplyToTicket={onReplyToTicket}
      onResolveTicket={onResolveTicket}
      onAssignTicket={onAssignTicket}
      onUpdateTicketPriority={onUpdateTicketPriority}
      onReturnTicket={onReturnTicket}
      onUpdateResolverStatus={onUpdateResolverStatus}
      onOpenResolverTicket={onOpenResolverTicket}
      onSaveProfile={onSaveProfile}
      onSavePreferences={onSavePreferences}
      onChangePassword={onChangePassword}
      onLogout={onLogout}
    />
  );
}
