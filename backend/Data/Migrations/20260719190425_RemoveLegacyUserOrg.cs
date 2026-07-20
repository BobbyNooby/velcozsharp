using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemoveLegacyUserOrg : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_users_Organizations_OrganizationId",
                table: "users");

            migrationBuilder.DropIndex(
                name: "IX_users_OrganizationId",
                table: "users");

            migrationBuilder.DropIndex(
                name: "IX_RecurringScanConfigs_OrganizationId_Enabled",
                table: "RecurringScanConfigs");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "users");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringScanConfigs_OrganizationId",
                table: "RecurringScanConfigs",
                column: "OrganizationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_RecurringScanConfigs_OrganizationId",
                table: "RecurringScanConfigs");

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "users",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_OrganizationId",
                table: "users",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringScanConfigs_OrganizationId_Enabled",
                table: "RecurringScanConfigs",
                columns: new[] { "OrganizationId", "Enabled" });

            migrationBuilder.AddForeignKey(
                name: "FK_users_Organizations_OrganizationId",
                table: "users",
                column: "OrganizationId",
                principalTable: "Organizations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
